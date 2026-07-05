import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  FolderPlus,
  Folder,
  History,
  LoaderCircle,
  MoreHorizontal,
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
import { downloadJson, collectionExportFilename } from "@/lib/download";
import { useDebouncedValue } from "@/lib/use-debounced-search";
import { toast } from "@/lib/toast";
import type { FolderTreeNode } from "@/lib/collections";
import { AddFolderMenu } from "@/components/AddFolderMenu";
import { CollectionRunResultsPanel } from "@/components/CollectionRunResultsPanel";
import { MethodBadge } from "@/components/MethodBadge";
import { TooltipIconButton } from "@/components/TooltipIconButton";
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
import type { ApiRequest, SavedRequest } from "@/types";
import { cn } from "@/lib/utils";

function requestSignature(request: ApiRequest): string {
  return `${request.method}\0${request.url}\0${request.name.trim()}`;
}

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
    request,
    newRequestTab,
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
  const activeSignature = requestSignature(request);

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
    <aside id="explorer-panel" className="flex min-h-0 flex-1 flex-col">
      <div className="explorer-header">
        <div className="explorer-header__title">
          <p className="text-title text-sm">Explorer</p>
          <div className="flex items-center gap-0.5">
            <TooltipIconButton
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground hover:text-foreground"
              label="New request"
              onClick={newRequestTab}
            >
              <Plus className="size-3.5" />
            </TooltipIconButton>
            <TooltipIconButton
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
              label="Hide explorer (⌘B)"
              onClick={toggleExplorerCollapsed}
            >
              <PanelLeftClose className="size-3.5" />
              <span className="hidden sm:inline">Hide</span>
            </TooltipIconButton>
          </div>
        </div>

        <div className="explorer-env-card">
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
            className="w-full max-w-none border-0 bg-transparent shadow-none"
          />
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={sidebarSearch}
            onChange={(event) => setSidebarSearch(event.target.value)}
            className="h-8 border-sidebar-border/80 bg-background/70 pl-8 text-[13px] shadow-none focus-visible:bg-background"
            placeholder="Search collections & history…"
          />
        </div>
      </div>

      <ScrollAreaWithTop className="min-h-0 flex-1" resetKey={sidebarSearch}>
        <div className="space-y-1 p-2">
          <Collapsible open={collectionsOpen} onOpenChange={setCollectionsOpen}>
            <div className="explorer-section-header">
              <CollapsibleTrigger asChild>
                <button type="button" className="explorer-section-trigger">
                  {collectionsOpen ? (
                    <ChevronDown className="size-3.5 shrink-0" />
                  ) : (
                    <ChevronRight className="size-3.5 shrink-0" />
                  )}
                  Collections
                  <span className="explorer-count-badge">{collectionGroups.length}</span>
                </button>
              </CollapsibleTrigger>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7 shrink-0 text-muted-foreground"
                    aria-label="Collection actions"
                  >
                    <MoreHorizontal className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem onClick={() => importRef.current?.click()}>
                    <Upload className="size-3.5" />
                    Import
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => downloadJson(exportCollections(), "pulse-collections.json")}
                  >
                    <Download className="size-3.5" />
                    Export all
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
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
            <CollapsibleContent className="explorer-tree-nested space-y-0.5">
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
                    <div className="explorer-collection-row group/collection">
                      <CollapsibleTrigger asChild>
                        <button type="button" className="explorer-tree-row min-w-0 flex-1 font-medium">
                          {open ? (
                            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                          )}
                          <span className="min-w-0 flex-1 truncate text-left">{group.name}</span>
                          <span className="explorer-count-badge">{items.length}</span>
                        </button>
                      </CollapsibleTrigger>
                      <TooltipIconButton
                        variant="ghost"
                        size="icon"
                        className="explorer-action-btn"
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
                      <AddFolderMenu
                        collectionId={group.id}
                        collectionName={group.name}
                        folders={group.folders}
                        trigger={
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="explorer-action-btn"
                            title="Add folder"
                            aria-label="Add folder"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <FolderPlus className="size-3.5" />
                          </Button>
                        }
                      />
                      <CollectionActionsMenu
                        collectionId={group.id}
                        collectionName={group.name}
                        exportCollection={exportCollection}
                      />
                    </div>
                    <CollapsibleContent className="explorer-tree-nested space-y-0.5">
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
                          activeSignature={activeSignature}
                        />
                      ))}
                      {grouped.root.map((item) => (
                        <CollectionItem
                          key={item.id}
                          item={item}
                          folders={group.folders}
                          selected={requestSignature(item.request) === activeSignature}
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
            <div className="explorer-section-header">
              <CollapsibleTrigger asChild>
                <button type="button" className="explorer-section-trigger min-w-0 flex-1">
                  {historyOpen ? (
                    <ChevronDown className="size-3.5 shrink-0" />
                  ) : (
                    <ChevronRight className="size-3.5 shrink-0" />
                  )}
                  <History className="size-3.5 shrink-0" />
                  <span>History</span>
                  {historyCount > 0 && <span className="explorer-count-badge">{historyCount}</span>}
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
            <CollapsibleContent className="explorer-tree-nested space-y-0.5">
              {historyEntries.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className={cn(
                    "explorer-tree-row group/item w-full",
                    requestSignature(entry.request) === activeSignature && "explorer-tree-row--active",
                  )}
                  onClick={() => loadHistoryEntry(entry)}
                >
                  <MethodBadge method={entry.request.method} />
                  <span className="min-w-0 flex-1 truncate text-left">
                    {entry.request.name || entry.request.url}
                  </span>
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
        <div className="shrink-0 border-t border-sidebar-border bg-sidebar/90 px-3 py-2 text-[12px] text-muted-foreground">
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

    </aside>
  );
}

function CollectionActionsMenu({
  collectionId,
  collectionName,
  exportCollection,
}: {
  collectionId: string;
  collectionName: string;
  exportCollection: (collectionId: string, format: "pulse" | "postman") => string | null;
}) {
  const exportAs = (format: "pulse" | "postman") => {
    const content = exportCollection(collectionId, format);
    if (!content) {
      toast.error("Export failed", "Collection not found");
      return;
    }
    const suffix = format === "postman" ? "postman_collection.json" : "pulse_collection.json";
    downloadJson(content, collectionExportFilename(collectionName, suffix));
    toast.success(
      "Collection exported",
      format === "postman" ? `${collectionName} (Postman)` : `${collectionName} (Pulse)`,
    );
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="explorer-action-btn mr-0.5"
          aria-label="Collection options"
          onClick={(event) => event.stopPropagation()}
        >
          <MoreHorizontal className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onClick={() => exportAs("pulse")}>
          <Download className="size-3.5" />
          Export Pulse
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => exportAs("postman")}>
          <Download className="size-3.5" />
          Export Postman
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
  activeSignature,
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
  activeSignature: string;
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
      <div className="group/folder flex items-center gap-0.5 rounded-md pr-0.5 hover:bg-sidebar-accent/50">
        <button
          type="button"
          className="explorer-tree-row min-w-0 flex-1 text-muted-foreground"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <ChevronDown className="size-3.5 shrink-0" /> : <ChevronRight className="size-3.5 shrink-0" />}
          <Folder className="size-3.5 shrink-0 text-primary/70" />
          <span className="truncate">{folder.name}</span>
          {isEmpty && <span className="explorer-count-badge">Empty</span>}
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
              className="explorer-action-btn"
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
            className="explorer-action-btn text-destructive"
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
        <div className="explorer-tree-nested space-y-0.5">
          {folder.requests.map((item) => (
            <CollectionItem
              key={item.id}
              item={item}
              folders={folders}
              selected={requestSignature(item.request) === activeSignature}
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
              activeSignature={activeSignature}
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
  selected,
  onOpen,
  onDuplicate,
  onDelete,
  onMove,
}: {
  item: SavedRequest;
  folders: string[];
  selected?: boolean;
  onOpen: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMove: (folder?: string) => void;
}) {
  return (
    <div className="group/item flex items-center gap-0.5 rounded-md pr-0.5 hover:bg-sidebar-accent/50">
      <button
        type="button"
        className={cn("explorer-tree-row min-w-0 flex-1", selected && "explorer-tree-row--active")}
        onClick={onOpen}
      >
        <MethodBadge method={item.request.method} />
        <span className="truncate text-foreground/90">{item.name}</span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="explorer-action-btn"
            aria-label="Request actions"
            onClick={(event) => event.stopPropagation()}
          >
            <MoreHorizontal className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel>Move to folder</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => onMove(undefined)}>No folder</DropdownMenuItem>
          {folders.length > 0 && <DropdownMenuSeparator />}
          {folders.map((folder) => (
            <DropdownMenuItem key={folder} onClick={() => onMove(folder)}>
              {folder}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onDuplicate}>
            <Copy className="size-3.5" />
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onDelete}>
            <Trash2 className="size-3.5" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
