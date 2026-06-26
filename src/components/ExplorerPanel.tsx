import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  FolderInput,
  FolderPlus,
  Folder,
  History,
  LoaderCircle,
  PanelLeftClose,
  Play,
  Plus,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { useApp } from "@/machines";
import { useHistory } from "@/hooks/useHistory";
import { groupRequestsByFolder, requestsForCollection } from "@/lib/collections";
import { runCollectionParallel, type CollectionRunResult } from "@/lib/collection-runner";
import { filterSavedRequests, filterSavedRequestsAsync } from "@/lib/filters";
import { downloadJson } from "@/lib/download";
import { useDebouncedValue } from "@/lib/use-debounced-search";
import { toast } from "@/lib/toast";
import type { FolderTreeNode } from "@/lib/collections";
import { AddFolderMenu } from "@/components/AddFolderMenu";
import { CollectionExportMenu } from "@/components/CollectionExportMenu";
import { CollectionRunResultsPanel } from "@/components/CollectionRunResultsPanel";
import { MethodBadge } from "@/components/MethodBadge";
import { TooltipIconButton, TooltipWrap } from "@/components/TooltipIconButton";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { EnvironmentSwitcher } from "@/components/EnvironmentSwitcher";
import { ScrollAreaWithTop } from "@/components/ui/scroll-area-with-top";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SavedRequest } from "@/types";

export function ExplorerPanel() {
  const {
    sidebarSearch,
    setSidebarSearch,
    setMainView,
    toggleExplorerCollapsed,
    collectionGroups,
    collections,
    environments,
    activeEnvironmentId,
    workspaceEnvironment,
    setActiveEnvironmentId,
    loadSavedRequest,
    deleteSavedRequest,
    duplicateSavedRequest,
    moveSavedRequest,
    loadHistoryEntry,
    clearHistory,
    exportCollections,
    exportCollection,
    importCollections,
    addEnvironment,
    deleteFolder,
    activeEnvironment,
  } = useApp();

  const {
    visibleEntries: historyEntries,
    totalCount: historyCount,
    hasMore: historyHasMore,
    loadMore: loadMoreHistory,
    loadingMore: historyLoadingMore,
    setSearchQuery: setHistorySearchQuery,
  } = useHistory();

  const importRef = useRef<HTMLInputElement>(null);
  const [collectionsOpen, setCollectionsOpen] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [openCollections, setOpenCollections] = useState<Record<string, boolean>>({});
  const [runningCollectionId, setRunningCollectionId] = useState<string | null>(null);
  const [collectionRun, setCollectionRun] = useState<CollectionRunResult | null>(null);
  const [runProgress, setRunProgress] = useState<string | null>(null);
  const [showRunResults, setShowRunResults] = useState(false);

  const debouncedSidebarSearch = useDebouncedValue(sidebarSearch);

  const filteredCollectionsSync = useMemo(() => {
    return filterSavedRequests(collections, debouncedSidebarSearch);
  }, [collections, debouncedSidebarSearch]);

  const [asyncFilteredCollections, setAsyncFilteredCollections] = useState<SavedRequest[] | null>(
    null,
  );

  useEffect(() => {
    setHistorySearchQuery(debouncedSidebarSearch);
  }, [debouncedSidebarSearch, setHistorySearchQuery]);

  useEffect(() => {
    if (!debouncedSidebarSearch.trim()) {
      setAsyncFilteredCollections(null);
      return;
    }

    let cancelled = false;
    void filterSavedRequestsAsync(collections, debouncedSidebarSearch).then((nextCollections) => {
      if (cancelled) return;
      setAsyncFilteredCollections(nextCollections);
    });

    return () => {
      cancelled = true;
    };
  }, [collections, debouncedSidebarSearch]);

  const filteredCollections = asyncFilteredCollections ?? filteredCollectionsSync;

  const handleRunCollection = async (collectionId: string, collectionName: string) => {
    const items = requestsForCollection(collections, collectionId);
    if (items.length === 0 || runningCollectionId) return;

    setRunningCollectionId(collectionId);
    setCollectionRun(null);
    setRunProgress(`Running 0/${items.length}`);

    try {
      const result = await runCollectionParallel(
        collectionId,
        collectionName,
        items,
        activeEnvironment,
        (_step, index, total) => {
          setRunProgress(`Running ${index + 1}/${total}`);
        },
      );
      setCollectionRun(result);
      setShowRunResults(true);
      if (result.totalTests > 0) {
        if (result.failed > 0) {
          toast.error(
            "Collection run finished",
            `${result.passed}/${result.totalTests} tests passed`,
          );
        } else {
          toast.success(
            "Collection run finished",
            `All ${result.totalTests} tests passed`,
          );
        }
      } else {
        toast.success("Collection run finished", `${result.steps.length} requests completed`);
      }
      setRunProgress(
        result.totalTests > 0
          ? `Done · ${result.passed}/${result.totalTests} tests passed`
          : `Done · ${result.steps.length} requests`,
      );
    } finally {
      setRunningCollectionId(null);
    }
  };

  return (
    <aside className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-sidebar-border/80 px-2.5 py-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[12px] font-medium text-foreground">Explorer</p>
          <TooltipIconButton
            variant="ghost"
            size="icon"
            className="size-7 shrink-0 text-muted-foreground"
            label="Hide explorer (⌘B)"
            onClick={toggleExplorerCollapsed}
          >
            <PanelLeftClose className="size-3.5" />
          </TooltipIconButton>
        </div>

        <div className="mt-2 space-y-2">
        <EnvironmentSwitcher
          mode="workspace"
          environments={environments}
          workspaceEnvironmentId={activeEnvironmentId}
          workspaceEnvironment={workspaceEnvironment}
          requestEnvironment={activeEnvironment}
          onSetWorkspace={setActiveEnvironmentId}
          onAddEnvironment={addEnvironment}
          onManageEnvironments={() => setMainView("environments")}
          compact
          className="w-full max-w-none"
        />

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={sidebarSearch}
            onChange={(event) => setSidebarSearch(event.target.value)}
            className="h-8 border-sidebar-border/80 bg-background/60 pl-8 text-[13px] shadow-none focus-visible:bg-background"
            placeholder="Search…"
          />
        </div>
        </div>
      </div>

      <ScrollAreaWithTop className="min-h-0 flex-1" resetKey={sidebarSearch}>
        <div className="space-y-0.5 p-1.5">
          <Collapsible open={collectionsOpen} onOpenChange={setCollectionsOpen}>
            <div className="flex items-center justify-between pr-0.5">
              <CollapsibleTrigger asChild>
                <button type="button" className="explorer-section-label rounded-sm hover:bg-sidebar-accent/70">
                  {collectionsOpen ? (
                    <ChevronDown className="size-3.5" />
                  ) : (
                    <ChevronRight className="size-3.5" />
                  )}
                  Collections
                </button>
              </CollapsibleTrigger>
              <div className="flex items-center gap-0.5">
                <TooltipIconButton
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  label="Import collection"
                  onClick={() => importRef.current?.click()}
                >
                  <Upload className="size-3.5" />
                </TooltipIconButton>
                <TooltipIconButton
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  label="Export all collections"
                  onClick={() => {
                    downloadJson(exportCollections(), "pulse-collections.json");
                  }}
                >
                  <Download className="size-3.5" />
                </TooltipIconButton>
              </div>
              <input
                ref={importRef}
                type="file"
                accept="application/json,.json,.yaml,.yml"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  void file.text().then(importCollections);
                  event.target.value = "";
                }}
              />
            </div>
            <CollapsibleContent className="space-y-1">
              {collectionGroups.map((group) => {
                const items = requestsForCollection(filteredCollections, group.id);
                const grouped = groupRequestsByFolder(items, group.folders);
                const open = openCollections[group.id] ?? true;

                return (
                  <Collapsible
                    key={group.id}
                    open={open}
                    onOpenChange={(value) =>
                      setOpenCollections((current) => ({ ...current, [group.id]: value }))
                    }
                  >
                    <div className="flex items-center gap-1 pr-1">
                      <CollapsibleTrigger asChild>
                        <button type="button" className="explorer-tree-row min-w-0 flex-1 font-medium">
                          {open ? (
                            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                          )}
                          <span className="min-w-0 flex-1 truncate">{group.name}</span>
                          <span className="rounded bg-muted/80 px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
                            {items.length}
                          </span>
                        </button>
                      </CollapsibleTrigger>
                      <AddFolderMenu
                        collectionId={group.id}
                        collectionName={group.name}
                        folders={group.folders}
                        trigger={
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-7 shrink-0"
                            title="Add folder"
                            aria-label="Add folder"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <FolderPlus className="size-3.5" />
                          </Button>
                        }
                      />
                      <CollectionExportMenu
                        collectionId={group.id}
                        collectionName={group.name}
                        exportCollection={exportCollection}
                      />
                      <TooltipIconButton
                        variant="ghost"
                        size="icon"
                        className="size-7 shrink-0"
                        label="Run collection"
                        disabled={items.length === 0 || runningCollectionId !== null}
                        onClick={() => void handleRunCollection(group.id, group.name)}
                      >
                        {runningCollectionId === group.id ? (
                          <LoaderCircle className="size-3.5 animate-spin" />
                        ) : (
                          <Play className="size-3.5" />
                        )}
                      </TooltipIconButton>
                    </div>
                    <CollapsibleContent className="space-y-0.5 pl-2">
                      {grouped.folders.map((folder) => (
                        <FolderBranch
                          key={folder.path}
                          folder={folder}
                          collectionId={group.id}
                          collectionName={group.name}
                          folders={group.folders}
                          onOpen={loadSavedRequest}
                          onDuplicate={duplicateSavedRequest}
                          onDelete={deleteSavedRequest}
                          onDeleteFolder={(folderPath) => deleteFolder(group.id, folderPath)}
                          onMove={(id, targetFolder) => moveSavedRequest(id, group.id, targetFolder)}
                        />
                      ))}
                      {grouped.root.map((item) => (
                        <CollectionItem
                          key={item.id}
                          item={item}
                          folders={group.folders}
                          onOpen={() => loadSavedRequest(item)}
                          onDuplicate={() => duplicateSavedRequest(item.id)}
                          onDelete={() => deleteSavedRequest(item.id)}
                          onMove={(targetFolder) => moveSavedRequest(item.id, group.id, targetFolder)}
                        />
                      ))}
                      {items.length === 0 && (
                        <p className="px-3 py-2 text-xs text-muted-foreground">No requests</p>
                      )}
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}
              {collectionGroups.length === 0 && (
                <p className="px-3 py-2 text-xs text-muted-foreground">No collections yet</p>
              )}
            </CollapsibleContent>
          </Collapsible>

          <div className="mx-2 my-1.5 h-px bg-border/50" />

          <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
            <div className="flex items-center justify-between pr-0.5">
              <CollapsibleTrigger asChild>
                <button type="button" className="explorer-section-label min-w-0 flex-1 rounded-sm hover:bg-sidebar-accent/70">
                  {historyOpen ? (
                    <ChevronDown className="size-3.5 shrink-0" />
                  ) : (
                    <ChevronRight className="size-3.5 shrink-0" />
                  )}
                  <History className="size-3.5 shrink-0" />
                  <span>History</span>
                  {historyCount > 0 && (
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium normal-case tracking-normal text-muted-foreground">
                      {historyCount}
                    </span>
                  )}
                </button>
              </CollapsibleTrigger>
              <TooltipIconButton
                variant="ghost"
                size="icon"
                className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                label="Clear history"
                disabled={historyCount === 0}
                onClick={() => {
                  clearHistory();
                  toast.success("History cleared");
                }}
              >
                <Trash2 className="size-3.5" />
              </TooltipIconButton>
            </div>
            <CollapsibleContent className="space-y-0.5">
              {historyEntries.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className="explorer-tree-row w-full"
                  onClick={() => loadHistoryEntry(entry)}
                >
                  <MethodBadge method={entry.request.method} />
                  <span className="min-w-0 flex-1 truncate">{entry.request.name || entry.request.url}</span>
                </button>
              ))}
              {historyEntries.length === 0 && (
                <p className="px-3 py-2 text-xs text-muted-foreground">No history yet</p>
              )}
              {historyHasMore && !debouncedSidebarSearch.trim() && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mx-2 mt-1 h-7 w-[calc(100%-1rem)] text-xs text-muted-foreground"
                  disabled={historyLoadingMore}
                  onClick={() => void loadMoreHistory()}
                >
                  {historyLoadingMore ? "Loading…" : "Load more"}
                </Button>
              )}
            </CollapsibleContent>
          </Collapsible>
        </div>
      </ScrollAreaWithTop>

      {(runProgress || collectionRun) && (
        <div className="border-t border-sidebar-border px-3 py-2 text-xs text-muted-foreground">
          {runProgress && <p>{runProgress}</p>}
          {collectionRun && collectionRun.totalTests > 0 && (
            <p className={collectionRun.failed > 0 ? "text-destructive" : "text-success"}>
              Collection tests: {collectionRun.passed}/{collectionRun.totalTests} passed
            </p>
          )}
          {collectionRun && (
            <button
              type="button"
              className="mt-1 font-medium text-foreground underline-offset-4 hover:underline"
              onClick={() => setShowRunResults(true)}
            >
              View runner results
            </button>
          )}
        </div>
      )}

      {showRunResults && collectionRun && (
        <CollectionRunResultsPanel
          result={collectionRun}
          onClose={() => setShowRunResults(false)}
        />
      )}

      <div className="shrink-0 border-t border-sidebar-border/80 p-1.5">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-full justify-start gap-1.5 px-2 text-[13px] text-muted-foreground hover:text-foreground"
          onClick={addEnvironment}
        >
          <Plus className="size-3.5" />
          New environment
        </Button>
      </div>
    </aside>
  );
}

function folderIsEmpty(folder: FolderTreeNode): boolean {
  if (folder.requests.length > 0) return false;
  return folder.children.every(folderIsEmpty);
}

function FolderBranch({
  folder,
  collectionId,
  collectionName,
  folders,
  onOpen,
  onDuplicate,
  onDelete,
  onDeleteFolder,
  onMove,
}: {
  folder: FolderTreeNode;
  collectionId: string;
  collectionName: string;
  folders: string[];
  onOpen: (item: SavedRequest) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onDeleteFolder: (folderPath: string) => void;
  onMove: (id: string, folder?: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const isEmpty = folderIsEmpty(folder);

  return (
    <div className="space-y-0.5">
      <div className="group/folder flex items-center gap-0.5 rounded-sm pr-0.5 hover:bg-sidebar-accent/70">
        <button
          type="button"
          className="explorer-tree-row min-w-0 flex-1 text-muted-foreground"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <ChevronDown className="size-3.5 shrink-0" /> : <ChevronRight className="size-3.5 shrink-0" />}
          <Folder className="size-3.5 shrink-0 opacity-70" />
          <span className="truncate">{folder.name}</span>
          {isEmpty && (
            <span className="rounded bg-muted/80 px-1 py-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">
              Empty
            </span>
          )}
        </button>
        <AddFolderMenu
          collectionId={collectionId}
          collectionName={collectionName}
          folders={folders}
          parentFolder={folder.path}
          trigger={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-6 shrink-0 opacity-0 group-hover/folder:opacity-100"
              title="Add subfolder"
              aria-label="Add subfolder"
              onClick={(event) => event.stopPropagation()}
            >
              <FolderPlus className="size-3.5" />
            </Button>
          }
        />
        {isEmpty && (
          <TooltipIconButton
            variant="ghost"
            size="icon"
            className="size-6 shrink-0 text-destructive opacity-0 group-hover/folder:opacity-100"
            label="Delete folder"
            onClick={(event) => {
              event.stopPropagation();
              onDeleteFolder(folder.path);
            }}
          >
            <Trash2 className="size-3.5" />
          </TooltipIconButton>
        )}
      </div>
      {open && (
        <div className="space-y-0.5 pl-4">
          {folder.requests.map((item) => (
            <CollectionItem
              key={item.id}
              item={item}
              folders={folders}
              onOpen={() => onOpen(item)}
              onDuplicate={() => onDuplicate(item.id)}
              onDelete={() => onDelete(item.id)}
              onMove={(targetFolder) => onMove(item.id, targetFolder)}
            />
          ))}
          {folder.children.map((child) => (
            <FolderBranch
              key={child.path}
              folder={child}
              collectionId={collectionId}
              collectionName={collectionName}
              folders={folders}
              onOpen={onOpen}
              onDuplicate={onDuplicate}
              onDelete={onDelete}
              onDeleteFolder={onDeleteFolder}
              onMove={onMove}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CollectionItem({
  item,
  folders,
  onOpen,
  onDuplicate,
  onDelete,
  onMove,
}: {
  item: SavedRequest;
  folders: string[];
  onOpen: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMove: (folder?: string) => void;
}) {
  return (
    <div className="group flex items-center gap-0.5 rounded-sm pr-0.5 hover:bg-sidebar-accent/70">
      <button type="button" className="explorer-tree-row min-w-0 flex-1" onClick={onOpen}>
        <MethodBadge method={item.request.method} />
        <span className="truncate text-foreground/90">{item.name}</span>
      </button>
      <DropdownMenu>
        <TooltipWrap label="Move to folder">
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 opacity-0 group-hover:opacity-100"
              aria-label="Move to folder"
              onClick={(event) => event.stopPropagation()}
            >
              <FolderInput className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipWrap>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel>Move to folder</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => onMove(undefined)}>No folder</DropdownMenuItem>
          {folders.length > 0 && <DropdownMenuSeparator />}
          {folders.map((folder) => (
            <DropdownMenuItem key={folder} onClick={() => onMove(folder)}>
              {folder}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <TooltipIconButton
        variant="ghost"
        size="icon"
        className="size-7 opacity-0 group-hover:opacity-100"
        label="Duplicate request"
        onClick={(event) => {
          event.stopPropagation();
          onDuplicate();
        }}
      >
        <Copy className="size-3.5" />
      </TooltipIconButton>
      <TooltipIconButton
        variant="ghost"
        size="icon"
        className="size-7 text-destructive opacity-0 group-hover:opacity-100"
        label="Delete request"
        onClick={(event) => {
          event.stopPropagation();
          onDelete();
        }}
      >
        <Trash2 className="size-3.5" />
      </TooltipIconButton>
    </div>
  );
}
