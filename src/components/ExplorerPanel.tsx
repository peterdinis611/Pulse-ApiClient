import { useEffect, useMemo, useState, type DragEvent, type ReactNode } from "react";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  Eye,
  Folder,
  FolderPlus,
  GripVertical,
  History,
  LoaderCircle,
  MoreHorizontal,
  PanelLeftClose,
  Play,
  Plus,
  Search,
  SearchX,
  Trash2,
  X,
} from "lucide-react";
import { useApp } from "@/machines";
import { useHistory } from "@/hooks/useHistory";
import { groupRequestsByFolder, requestsForCollection } from "@/lib/collections";
import { runCollectionAuto, type CollectionRunResult } from "@/lib/collection-runner";
import { filterSavedRequests, filterSavedRequestsAsync } from "@/lib/filters";
import { downloadJson, collectionExportFilename } from "@/lib/download";
import {
  COLLECTION_DND_MIME,
  encodeCollectionDragPayload,
  getActiveCollectionDrag,
  readCollectionDragPayload,
  setActiveCollectionDrag,
  type CollectionDragPayload,
} from "@/lib/collection-dnd";
import { useDebouncedSearch } from "@/lib/use-debounced-search";
import { toast } from "@/lib/toast";
import type { FolderTreeNode } from "@/lib/collections";
import { AddFolderMenu } from "@/components/AddFolderMenu";
import { CollectionRunResultsPanel } from "@/components/CollectionRunResultsPanel";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ExplorerTransferMenu } from "@/components/ExplorerTransferMenu";
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
import type { ApiRequest, HistoryEntry, SavedRequest } from "@/types";
import { methodShortLabel, methodTextClass, statusBadgeClass } from "@/lib/method-colors";
import { cn } from "@/lib/utils";

type PreviewTarget =
  | { kind: "collection"; item: SavedRequest }
  | { kind: "history"; entry: HistoryEntry };

function requestSignature(request: ApiRequest): string {
  return `${request.method}\0${request.url}\0${request.name.trim()}`;
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

/** Path leaf only — never append query (it blows past the sidebar width). */
function shortUrlParts(url: string): { title: string; host: string; hasQuery: boolean } {
  const raw = url.trim();
  if (!raw) return { title: "(no URL)", host: "", hasQuery: false };
  try {
    const parsed = new URL(raw);
    const segments = parsed.pathname.split("/").filter(Boolean);
    const leaf = segments.length > 0 ? segments[segments.length - 1]! : "/";
    return { title: leaf, host: parsed.host, hasQuery: parsed.search.length > 1 };
  } catch {
    const stripped = raw.replace(/^https?:\/\//, "");
    const q = stripped.indexOf("?");
    const pathPart = q >= 0 ? stripped.slice(0, q) : stripped;
    const slash = pathPart.indexOf("/");
    if (slash === -1) return { title: pathPart, host: "", hasQuery: q >= 0 };
    const leaf = pathPart.slice(slash + 1).split("/").filter(Boolean).pop() ?? "/";
    return { title: leaf, host: pathPart.slice(0, slash), hasQuery: q >= 0 };
  }
}

function requestDisplayName(request: ApiRequest): string | null {
  const name = request.name.trim();
  if (!name || name === "Untitled Request") return null;
  return name;
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
    relocateSavedRequest,
    reorderFolder,
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
    searching: historySearching,
    setSearchQuery: setHistorySearchQuery,
  } = useHistory();

  const [collectionsOpen, setCollectionsOpen] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [openCollections, setOpenCollections] = useState<Record<string, boolean>>({});
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});

  const folderOpenKey = (collectionId: string, path: string) => `${collectionId}:${path}`;
  const isFolderOpen = (collectionId: string, path: string) =>
    openFolders[folderOpenKey(collectionId, path)] ?? true;
  const setFolderOpen = (collectionId: string, path: string, open: boolean) => {
    setOpenFolders((current) => ({ ...current, [folderOpenKey(collectionId, path)]: open }));
  };
  const [runningCollectionId, setRunningCollectionId] = useState<string | null>(null);
  const [collectionRun, setCollectionRun] = useState<CollectionRunResult | null>(null);
  const [runProgress, setRunProgress] = useState<string | null>(null);
  const [showRunResults, setShowRunResults] = useState(false);
  const [preview, setPreview] = useState<PreviewTarget | null>(null);
  const [clearHistoryOpen, setClearHistoryOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<
    | { kind: "request"; id: string; name: string }
    | { kind: "folder"; collectionId: string; path: string }
    | null
  >(null);
  const [pendingMove, setPendingMove] = useState<{
    id: string;
    name: string;
    collectionId: string;
    fromFolder?: string;
    toFolder?: string;
    targetId?: string | null;
    position?: "before" | "after";
  } | null>(null);
  const search = useDebouncedSearch(sidebarSearch, { delayMs: 180 });

  const folderDestinationLabel = (folder?: string) =>
    folder?.trim() ? folder : "collection root (no folder)";

  const sameFolder = (a?: string, b?: string) => (a ?? undefined) === (b ?? undefined);

  const requestFolderChange = (
    id: string,
    collectionId: string,
    toFolder: string | undefined,
    extras?: { targetId?: string | null; position?: "before" | "after" },
  ) => {
    const item = collections.find((entry) => entry.id === id);
    if (!item || item.collectionId !== collectionId) return;

    if (sameFolder(item.folder, toFolder)) {
      if (extras?.targetId) {
        relocateSavedRequest(id, collectionId, {
          folder: toFolder,
          targetId: extras.targetId,
          position: extras.position,
        });
      }
      return;
    }

    setPendingMove({
      id,
      name: item.name || item.request.name || "Untitled Request",
      collectionId,
      fromFolder: item.folder,
      toFolder,
      targetId: extras?.targetId,
      position: extras?.position,
    });
  };

  // Instant fuse.js on live query — authoritative while typing / when async is stale
  const instantCollections = useMemo(() => {
    return filterSavedRequests(collections, search.query);
  }, [collections, search.query]);

  const [refinedCollections, setRefinedCollections] = useState<{
    query: string;
    items: SavedRequest[];
  } | null>(null);
  const [collectionsSearching, setCollectionsSearching] = useState(false);

  useEffect(() => {
    // Feed history the live query — fuse is instant; remote search is debounced inside useHistory
    setHistorySearchQuery(search.query);
  }, [search.query, setHistorySearchQuery]);

  useEffect(() => {
    if (!search.debouncedQuery) {
      setRefinedCollections(null);
      setCollectionsSearching(false);
      return;
    }

    const queryForRequest = search.debouncedQuery;
    let cancelled = false;
    setCollectionsSearching(true);
    void filterSavedRequestsAsync(collections, queryForRequest).then((nextCollections) => {
      if (cancelled) return;
      setRefinedCollections({ query: queryForRequest, items: nextCollections });
      setCollectionsSearching(false);
    });

    return () => {
      cancelled = true;
    };
  }, [collections, search.debouncedQuery]);

  // Never prefer stale async results over a newer live fuse filter
  const filteredCollections =
    refinedCollections && refinedCollections.query === search.query
      ? refinedCollections.items
      : instantCollections;
  const isSearchMode = search.hasQuery;
  const isSearchBusy = search.isPending || historySearching || collectionsSearching;
  const resultCount = filteredCollections.length + historyEntries.length;
  const activeSignature = requestSignature(request);
  const searchSuggestions = useMemo(() => {
    const hints = new Set<string>(["GET", "POST"]);
    for (const item of collections.slice(0, 12)) {
      hints.add(item.request.method);
      try {
        const path = new URL(item.request.url).pathname.split("/").filter(Boolean);
        const leaf = path[path.length - 1];
        if (leaf && leaf.length < 28) hints.add(leaf);
      } catch {
        // ignore invalid urls
      }
      if (hints.size >= 6) break;
    }
    return [...hints].slice(0, 6);
  }, [collections]);

  const handleRunCollection = async (collectionId: string, collectionName: string) => {
    const items = requestsForCollection(collections, collectionId);
    if (items.length === 0 || runningCollectionId) return;

    setRunningCollectionId(collectionId);
    setCollectionRun(null);
    setRunProgress(`Running 0/${items.length}`);

    try {
      const result = await runCollectionAuto(
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
          toast.success("Collection run finished", `All ${result.totalTests} tests passed`);
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

  const openPreview = (target: PreviewTarget) => setPreview(target);

  const openFromPreview = () => {
    if (!preview) return;
    if (preview.kind === "collection") loadSavedRequest(preview.item);
    else loadHistoryEntry(preview.entry);
    setPreview(null);
  };

  return (
    <aside id="explorer-panel" className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
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
            <ExplorerTransferMenu
              collectionCount={collectionGroups.length}
              requestCount={collections.length}
              exportCollections={exportCollections}
              importCollections={importCollections}
            />
            <TooltipIconButton
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground hover:text-foreground"
              label="Hide explorer (⌘B)"
              onClick={toggleExplorerCollapsed}
            >
              <PanelLeftClose className="size-3.5" />
            </TooltipIconButton>
          </div>
        </div>

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

        <div className="space-y-1.5">
          <div className="relative">
            {isSearchBusy ? (
              <LoaderCircle className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-primary" />
            ) : (
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            )}
            <Input
              value={sidebarSearch}
              onChange={(event) => setSidebarSearch(event.target.value)}
              className="h-8 border-sidebar-border/80 bg-background/70 pl-8 pr-8 text-[13px] shadow-none focus-visible:bg-background"
              placeholder="Search by name, path, method…"
              aria-busy={isSearchBusy}
            />
            {sidebarSearch && (
              <button
                type="button"
                className="absolute right-1.5 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                aria-label="Clear search"
                onClick={() => setSidebarSearch("")}
              >
                <X className="size-3" />
              </button>
            )}
          </div>
          {isSearchMode && (
            <div className="flex items-center gap-1.5 px-0.5">
              <span
                className={cn(
                  "inline-flex h-5 items-center rounded-md px-1.5 text-[10px] font-medium tabular-nums",
                  isSearchBusy
                    ? "bg-primary/10 text-primary"
                    : resultCount === 0
                      ? "bg-muted text-muted-foreground"
                      : "bg-primary/10 text-primary",
                )}
              >
                {isSearchBusy
                  ? search.isPending
                    ? "Typing…"
                    : "Searching…"
                  : `${resultCount} result${resultCount === 1 ? "" : "s"}`}
              </span>
              {!isSearchBusy && resultCount > 0 && (
                <span className="truncate text-[11px] text-muted-foreground">
                  for “{search.query}”
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {preview ? (
        <RequestPreviewPanel
          target={preview}
          onClose={() => setPreview(null)}
          onOpen={openFromPreview}
        />
      ) : (
        <ScrollAreaWithTop
          className="min-h-0 flex-1"
          resetKey={`${search.query}:${isSearchMode ? "search" : "browse"}`}
        >
          <div className="min-w-0 space-y-3 p-2 pb-3">
            {isSearchMode ? (
              <SearchResults
                key={search.query}
                collections={filteredCollections}
                collectionGroups={collectionGroups}
                historyEntries={historyEntries}
                activeSignature={activeSignature}
                loading={isSearchBusy && filteredCollections.length === 0 && historyEntries.length === 0}
                query={search.query}
                onOpenCollection={loadSavedRequest}
                onOpenHistory={loadHistoryEntry}
                onPreview={openPreview}
                onClear={() => setSidebarSearch("")}
                onApplyQuery={setSidebarSearch}
                suggestions={searchSuggestions}
              />
            ) : (
              <>
                <section>
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
                    </div>
                    <CollapsibleContent className="mt-0.5 space-y-0.5">
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
                                <button
                                  type="button"
                                  className="explorer-tree-row min-w-0 flex-1 font-medium"
                                >
                                  {open ? (
                                    <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                                  ) : (
                                    <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                                  )}
                                  <span className="min-w-0 flex-1 truncate text-left">
                                    {group.name}
                                  </span>
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
                                  dndEnabled={!isSearchMode}
                                  isFolderOpen={isFolderOpen}
                                  setFolderOpen={setFolderOpen}
                                  onOpen={loadSavedRequest}
                                  onPreview={(item) =>
                                    openPreview({ kind: "collection", item })
                                  }
                                  onDuplicate={duplicateSavedRequest}
                                  onDelete={(id, name) =>
                                    setPendingDelete({ kind: "request", id, name })
                                  }
                                  onDeleteFolder={(folderPath) =>
                                    setPendingDelete({
                                      kind: "folder",
                                      collectionId: group.id,
                                      path: folderPath,
                                    })
                                  }
                                  onMove={(id, targetFolder) =>
                                    requestFolderChange(id, group.id, targetFolder)
                                  }
                                  onRelocateRequest={(id, options) =>
                                    requestFolderChange(id, group.id, options.folder, {
                                      targetId: options.targetId,
                                      position: options.position,
                                    })
                                  }
                                  onReorderFolder={(path, targetPath, position) =>
                                    reorderFolder(group.id, path, targetPath, position)
                                  }
                                  activeSignature={activeSignature}
                                />
                              ))}
                              <CollectionDropRoot
                                collectionId={group.id}
                                dndEnabled={!isSearchMode}
                                onDropRequest={(id) =>
                                  requestFolderChange(id, group.id, undefined)
                                }
                              >
                                {grouped.root.map((item) => (
                                  <CollectionItem
                                    key={item.id}
                                    item={item}
                                    folders={group.folders}
                                    dndEnabled={!isSearchMode}
                                    selected={requestSignature(item.request) === activeSignature}
                                    onOpen={() => loadSavedRequest(item)}
                                    onPreview={() => openPreview({ kind: "collection", item })}
                                    onDuplicate={() => duplicateSavedRequest(item.id)}
                                    onDelete={() =>
                                      setPendingDelete({
                                        kind: "request",
                                        id: item.id,
                                        name: item.name,
                                      })
                                    }
                                    onMove={(targetFolder) =>
                                      requestFolderChange(item.id, group.id, targetFolder)
                                    }
                                    onRelocate={(draggedId, position) =>
                                      requestFolderChange(draggedId, group.id, undefined, {
                                        targetId: item.id,
                                        position,
                                      })
                                    }
                                  />
                                ))}
                              </CollectionDropRoot>
                              {items.length === 0 && grouped.folders.length === 0 && (
                                <p className="px-2 py-1.5 text-[11px] text-muted-foreground">
                                  No requests
                                </p>
                              )}
                            </CollapsibleContent>
                          </Collapsible>
                        );
                      })}
                      {collectionGroups.length === 0 && (
                        <p className="px-2 py-1.5 text-[11px] text-muted-foreground">
                          No collections yet
                        </p>
                      )}
                    </CollapsibleContent>
                  </Collapsible>
                </section>

                <section>
                  <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
                    <div className="explorer-section-header">
                      <CollapsibleTrigger asChild>
                        <button type="button" className="explorer-section-trigger min-w-0 flex-1">
                          {historyOpen ? (
                            <ChevronDown className="size-3.5 shrink-0" />
                          ) : (
                            <ChevronRight className="size-3.5 shrink-0" />
                          )}
                          <History className="size-3 shrink-0 opacity-70" />
                          History
                          {historyCount > 0 && (
                            <span className="explorer-count-badge">{historyCount}</span>
                          )}
                        </button>
                      </CollapsibleTrigger>
                      <TooltipIconButton
                        variant="ghost"
                        size="icon"
                        className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                        label="Clear history"
                        disabled={historyCount === 0}
                        onClick={() => setClearHistoryOpen(true)}
                      >
                        <Trash2 className="size-3.5" />
                      </TooltipIconButton>
                    </div>
                    <CollapsibleContent className="mt-0.5 space-y-0.5">
                      {historyEntries.map((entry) => (
                        <HistoryRow
                          key={entry.id}
                          entry={entry}
                          active={requestSignature(entry.request) === activeSignature}
                          onClick={() => loadHistoryEntry(entry)}
                          onPreview={() => openPreview({ kind: "history", entry })}
                        />
                      ))}
                      {historyEntries.length === 0 && (
                        <p className="px-2 py-1.5 text-[11px] text-muted-foreground">
                          No history yet
                        </p>
                      )}
                      {historyHasMore && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="mt-1 h-7 w-full text-xs text-muted-foreground"
                          disabled={historyLoadingMore}
                          onClick={() => void loadMoreHistory()}
                        >
                          {historyLoadingMore ? "Loading…" : "Load more"}
                        </Button>
                      )}
                    </CollapsibleContent>
                  </Collapsible>
                </section>
              </>
            )}
          </div>
        </ScrollAreaWithTop>
      )}

      {(runProgress || collectionRun) && (
        <div className="shrink-0 border-t border-sidebar-border bg-sidebar/95 px-3 py-2.5">
          {runProgress && (
            <p className="text-[12px] text-muted-foreground">{runProgress}</p>
          )}
          {collectionRun && (
            <div className="mt-1 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-[12px] font-medium text-foreground">
                  {collectionRun.collectionName}
                </p>
                <p
                  className={cn(
                    "text-[11px]",
                    collectionRun.failed > 0 ||
                      collectionRun.steps.some((step) => Boolean(step.error))
                      ? "text-destructive"
                      : "text-success",
                  )}
                >
                  {collectionRun.totalTests > 0
                    ? `${collectionRun.passed}/${collectionRun.totalTests} tests passed`
                    : `${collectionRun.steps.filter((s) => !s.error).length}/${collectionRun.steps.length} ok`}
                </p>
              </div>
              <button
                type="button"
                className="shrink-0 rounded-md bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary hover:bg-primary/15"
                onClick={() => setShowRunResults(true)}
              >
                View results
              </button>
            </div>
          )}
        </div>
      )}

      {showRunResults && collectionRun && (
        <CollectionRunResultsPanel
          result={collectionRun}
          onClose={() => setShowRunResults(false)}
        />
      )}

      <ConfirmDialog
        open={clearHistoryOpen}
        onOpenChange={setClearHistoryOpen}
        title="Clear history?"
        description={
          historyCount === 1
            ? "This will permanently remove 1 history entry."
            : `This will permanently remove ${historyCount} history entries.`
        }
        confirmLabel="Clear history"
        onConfirm={() => {
          clearHistory();
          toast.success("History cleared");
        }}
      />

      <ConfirmDialog
        open={pendingDelete?.kind === "request"}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title="Delete request?"
        description={
          pendingDelete?.kind === "request"
            ? `“${pendingDelete.name}” will be removed from this collection.`
            : "This request will be removed from the collection."
        }
        confirmLabel="Delete"
        onConfirm={() => {
          if (pendingDelete?.kind === "request") {
            deleteSavedRequest(pendingDelete.id);
            toast.success("Request deleted", pendingDelete.name);
          }
          setPendingDelete(null);
        }}
      />

      <ConfirmDialog
        open={pendingDelete?.kind === "folder"}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title="Delete folder?"
        description={
          pendingDelete?.kind === "folder"
            ? `Empty folder “${pendingDelete.path}” will be removed.`
            : "This folder will be removed."
        }
        confirmLabel="Delete"
        onConfirm={() => {
          if (pendingDelete?.kind === "folder") {
            deleteFolder(pendingDelete.collectionId, pendingDelete.path);
            toast.success("Folder deleted", pendingDelete.path);
          }
          setPendingDelete(null);
        }}
      />

      <ConfirmDialog
        open={pendingMove != null}
        onOpenChange={(open) => {
          if (!open) setPendingMove(null);
        }}
        title="Move request?"
        description={
          pendingMove
            ? `Move “${pendingMove.name}” from ${folderDestinationLabel(pendingMove.fromFolder)} to ${folderDestinationLabel(pendingMove.toFolder)}?`
            : "Move this request to another folder?"
        }
        confirmLabel="Move"
        destructive={false}
        onConfirm={() => {
          if (!pendingMove) return;
          relocateSavedRequest(pendingMove.id, pendingMove.collectionId, {
            folder: pendingMove.toFolder,
            targetId: pendingMove.targetId,
            position: pendingMove.position,
          });
          toast.success(
            "Request moved",
            `${pendingMove.name} → ${folderDestinationLabel(pendingMove.toFolder)}`,
          );
          setPendingMove(null);
        }}
      />
    </aside>
  );
}

function SearchResults({
  collections,
  collectionGroups,
  historyEntries,
  activeSignature,
  loading,
  query,
  onOpenCollection,
  onOpenHistory,
  onPreview,
  onClear,
  onApplyQuery,
  suggestions = ["GET", "POST"],
}: {
  collections: SavedRequest[];
  collectionGroups: Array<{ id: string; name: string }>;
  historyEntries: HistoryEntry[];
  activeSignature: string;
  loading?: boolean;
  query: string;
  onOpenCollection: (item: SavedRequest) => void;
  onOpenHistory: (entry: HistoryEntry) => void;
  onPreview: (target: PreviewTarget) => void;
  onClear: () => void;
  onApplyQuery: (value: string) => void;
  suggestions?: string[];
}) {
  const groupName = (collectionId: string) =>
    collectionGroups.find((g) => g.id === collectionId)?.name ?? "Collection";

  const empty = collections.length === 0 && historyEntries.length === 0;

  if (loading && empty) {
    return (
      <div className="flex flex-col items-center gap-3 px-3 py-10 text-center">
        <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          <LoaderCircle className="size-4 animate-spin" />
        </div>
        <div className="space-y-1">
          <p className="text-[13px] font-medium text-foreground">Searching</p>
          <p className="text-[12px] text-muted-foreground">Matching collections and history…</p>
        </div>
      </div>
    );
  }

  if (empty) {
    return (
      <div className="flex flex-col items-center gap-4 px-3 py-8 text-center">
        <div className="flex size-11 items-center justify-center rounded-full bg-muted/80 text-muted-foreground">
          <SearchX className="size-5" />
        </div>
        <div className="space-y-1.5">
          <p className="text-[13px] font-medium text-foreground">No matches</p>
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            Nothing found for{" "}
            <span className="rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground/80">
              {query}
            </span>
          </p>
        </div>
        <div className="w-full space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
            Try searching for
          </p>
          <div className="flex flex-wrap justify-center gap-1.5">
            {suggestions.map((hint) => (
              <button
                key={hint}
                type="button"
                className="rounded-md border border-border/70 bg-background/80 px-2 py-1 font-mono text-[11px] text-foreground/80 transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
                onClick={() => onApplyQuery(hint)}
              >
                {hint}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          className="text-[12px] font-medium text-primary underline-offset-4 hover:underline"
          onClick={onClear}
        >
          Clear search
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {collections.length > 0 && (
        <section className="space-y-1">
          <p className="explorer-section-label">
            Collections
            <span className="explorer-count-badge ml-1.5">{collections.length}</span>
          </p>
          <div className="space-y-0.5">
            {collections.map((item) => {
              const { title, host } = shortUrlParts(item.request.url);
              const name = requestDisplayName(item.request) ?? item.name;
              return (
                <ResultRow
                  key={item.id}
                  method={item.request.method}
                  title={name}
                  subtitle={[groupName(item.collectionId), item.folder, host || title]
                    .filter(Boolean)
                    .join(" · ")}
                  query={query}
                  active={requestSignature(item.request) === activeSignature}
                  onOpen={() => onOpenCollection(item)}
                  onPreview={() => onPreview({ kind: "collection", item })}
                />
              );
            })}
          </div>
        </section>
      )}

      {historyEntries.length > 0 && (
        <section className="space-y-1">
          <p className="explorer-section-label">
            History
            <span className="explorer-count-badge ml-1.5">{historyEntries.length}</span>
          </p>
          <div className="space-y-0.5">
            {historyEntries.map((entry) => {
              const name = requestDisplayName(entry.request);
              const { title, host } = shortUrlParts(entry.request.url);
              return (
                <ResultRow
                  key={entry.id}
                  method={entry.request.method}
                  title={name ?? title}
                  subtitle={[host, entry.response ? `${entry.response.status}` : null, relativeTime(entry.sentAt)]
                    .filter(Boolean)
                    .join(" · ")}
                  query={query}
                  status={entry.response?.status}
                  active={requestSignature(entry.request) === activeSignature}
                  onOpen={() => onOpenHistory(entry)}
                  onPreview={() => onPreview({ kind: "history", entry })}
                />
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function highlightMatch(text: string, query: string): ReactNode {
  const q = query.trim();
  if (!q || !text) return text;
  const lower = text.toLowerCase();
  const needle = q.toLowerCase();
  const index = lower.indexOf(needle);
  if (index === -1) return text;
  return (
    <>
      {text.slice(0, index)}
      <mark className="rounded-sm bg-primary/15 px-0.5 text-foreground">{text.slice(index, index + q.length)}</mark>
      {text.slice(index + q.length)}
    </>
  );
}

function ResultRow({
  method,
  title,
  subtitle,
  query,
  status,
  active,
  onOpen,
  onPreview,
}: {
  method: string;
  title: string;
  subtitle: string;
  query?: string;
  status?: number;
  active: boolean;
  onOpen: () => void;
  onPreview: () => void;
}) {
  return (
    <div className={cn("explorer-row group/item", active && "explorer-row--active")}>
      <button type="button" className="explorer-row__main" onClick={onOpen}>
        <span className={cn("explorer-method", methodTextClass(method))}>
          {methodShortLabel(method)}
        </span>
        <span className="min-w-0 flex-1 overflow-hidden">
          <span className="block truncate text-[13px] font-medium text-foreground/90">
            {query ? highlightMatch(title, query) : title}
          </span>
          <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
            {query ? highlightMatch(subtitle, query) : subtitle}
          </span>
        </span>
        {status !== undefined && (
          <span
            className={cn(
              "shrink-0 rounded px-1 py-0.5 font-mono text-[10px] font-semibold",
              statusBadgeClass(status),
            )}
          >
            {status}
          </span>
        )}
      </button>
      <TooltipIconButton
        variant="ghost"
        size="icon"
        className="explorer-row__preview"
        label="View details"
        onClick={(e) => {
          e.stopPropagation();
          onPreview();
        }}
      >
        <Eye className="size-3.5" />
      </TooltipIconButton>
    </div>
  );
}

function HistoryRow({
  entry,
  active,
  onClick,
  onPreview,
}: {
  entry: HistoryEntry;
  active: boolean;
  onClick: () => void;
  onPreview?: () => void;
}) {
  const name = requestDisplayName(entry.request);
  const { title, host, hasQuery } = shortUrlParts(entry.request.url);
  const primary = name ?? title;
  const secondary = [host, hasQuery ? "query" : null, entry.response ? `${entry.response.elapsedMs} ms` : null, relativeTime(entry.sentAt)]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className={cn("explorer-row group/item", active && "explorer-row--active")}>
      <button type="button" className="explorer-row__main" onClick={onClick}>
        <span className={cn("explorer-method", methodTextClass(entry.request.method))}>
          {methodShortLabel(entry.request.method)}
        </span>
        <span className="min-w-0 flex-1 overflow-hidden">
          <span className="block truncate text-[13px] font-medium text-foreground/90">{primary}</span>
          <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{secondary}</span>
        </span>
        {entry.response && (
          <span
            className={cn(
              "shrink-0 rounded px-1 py-0.5 font-mono text-[10px] font-semibold",
              statusBadgeClass(entry.response.status),
            )}
          >
            {entry.response.status}
          </span>
        )}
      </button>
      {onPreview && (
        <TooltipIconButton
          variant="ghost"
          size="icon"
          className="explorer-row__preview"
          label="View details"
          onClick={(e) => {
            e.stopPropagation();
            onPreview();
          }}
        >
          <Eye className="size-3.5" />
        </TooltipIconButton>
      )}
    </div>
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

function dropPositionFromEvent(event: DragEvent<HTMLElement>): "before" | "after" {
  const rect = event.currentTarget.getBoundingClientRect();
  return event.clientY < rect.top + rect.height / 2 ? "before" : "after";
}

function isCollectionDragEvent(event: DragEvent): boolean {
  if (getActiveCollectionDrag()) return true;
  const types = Array.from(event.dataTransfer?.types ?? []);
  return types.includes("text/plain") || types.includes("text") || types.includes(COLLECTION_DND_MIME);
}

function beginCollectionDrag(event: DragEvent, payload: CollectionDragPayload): void {
  setActiveCollectionDrag(payload);
  const encoded = encodeCollectionDragPayload(payload);
  event.dataTransfer.setData("text/plain", encoded);
  event.dataTransfer.setData("text", encoded);
  event.dataTransfer.effectAllowed = "move";
}

function endCollectionDrag(): void {
  setActiveCollectionDrag(null);
}

function CollectionDropRoot({
  collectionId,
  dndEnabled,
  onDropRequest,
  children,
}: {
  collectionId: string;
  dndEnabled: boolean;
  onDropRequest: (id: string) => void;
  children: ReactNode;
}) {
  const [over, setOver] = useState(false);

  if (!dndEnabled) return <>{children}</>;

  return (
    <div
      className={cn(
        "min-h-6 space-y-0.5 rounded-md transition-colors",
        over && "bg-primary/8 ring-1 ring-inset ring-primary/30",
      )}
      onDragOver={(event) => {
        if (!isCollectionDragEvent(event)) return;
        const active = getActiveCollectionDrag();
        if (active && (active.kind !== "request" || active.collectionId !== collectionId)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        const payload = readCollectionDragPayload(event.dataTransfer);
        endCollectionDrag();
        if (!payload || payload.kind !== "request") return;
        if (payload.collectionId !== collectionId) return;
        onDropRequest(payload.id);
      }}
    >
      {children}
    </div>
  );
}

function FolderBranch({
  folder,
  collectionId,
  collectionName,
  folders,
  dndEnabled,
  activeSignature,
  isFolderOpen,
  setFolderOpen,
  onOpen,
  onPreview,
  onDuplicate,
  onDelete,
  onDeleteFolder,
  onMove,
  onRelocateRequest,
  onReorderFolder,
}: {
  folder: FolderTreeNode;
  collectionId: string;
  collectionName: string;
  folders: string[];
  dndEnabled: boolean;
  activeSignature: string;
  isFolderOpen: (collectionId: string, path: string) => boolean;
  setFolderOpen: (collectionId: string, path: string, open: boolean) => void;
  onOpen: (item: SavedRequest) => void;
  onPreview?: (item: SavedRequest) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string, name: string) => void;
  onDeleteFolder: (folderPath: string) => void;
  onMove: (id: string, folder?: string) => void;
  onRelocateRequest: (
    id: string,
    options: { folder?: string; targetId?: string | null; position?: "before" | "after" },
  ) => void;
  onReorderFolder: (path: string, targetPath: string, position: "before" | "after") => void;
}) {
  const open = isFolderOpen(collectionId, folder.path);
  const [dropEdge, setDropEdge] = useState<"before" | "after" | "into" | null>(null);
  const isEmpty = folderIsEmpty(folder);

  return (
    <Collapsible
      open={open}
      onOpenChange={(value) => setFolderOpen(collectionId, folder.path, value)}
      className="space-y-0.5"
    >
      <div
        className={cn(
          "group/folder relative flex items-center gap-0.5 rounded-md",
          dropEdge === "into" && "bg-primary/10 ring-1 ring-inset ring-primary/35",
          dropEdge === "before" &&
            "before:absolute before:inset-x-1 before:top-0 before:h-0.5 before:rounded-full before:bg-primary",
          dropEdge === "after" &&
            "after:absolute after:inset-x-1 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary",
        )}
        onDragOver={(event) => {
          if (!dndEnabled || !isCollectionDragEvent(event)) return;
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = "move";
          const rect = event.currentTarget.getBoundingClientRect();
          const y = event.clientY - rect.top;
          if (y < rect.height * 0.25) setDropEdge("before");
          else if (y > rect.height * 0.75) setDropEdge("after");
          else setDropEdge("into");
        }}
        onDragLeave={() => setDropEdge(null)}
        onDrop={(event) => {
          if (!dndEnabled) return;
          event.preventDefault();
          event.stopPropagation();
          const payload = readCollectionDragPayload(event.dataTransfer);
          const edge = dropEdge;
          setDropEdge(null);
          endCollectionDrag();
          if (!payload || payload.collectionId !== collectionId) return;

          if (payload.kind === "request") {
            onRelocateRequest(payload.id, { folder: folder.path });
            setFolderOpen(collectionId, folder.path, true);
            return;
          }

          if (payload.kind === "folder" && payload.path !== folder.path && edge && edge !== "into") {
            onReorderFolder(payload.path, folder.path, edge);
          }
        }}
      >
        {dndEnabled && (
          <button
            type="button"
            className="flex size-7 shrink-0 cursor-grab items-center justify-center text-muted-foreground active:cursor-grabbing"
            draggable
            title="Drag folder"
            aria-label="Drag folder"
            onClick={(event) => event.preventDefault()}
            onPointerDown={(event) => event.stopPropagation()}
            onDragStart={(event) => {
              event.stopPropagation();
              beginCollectionDrag(event, {
                kind: "folder",
                path: folder.path,
                collectionId,
              });
            }}
            onDragEnd={() => endCollectionDrag()}
          >
            <GripVertical className="size-3.5" />
          </button>
        )}
        <CollapsibleTrigger asChild>
          <button
            type="button"
            draggable={false}
            className="explorer-tree-row min-w-0 flex-1 text-muted-foreground"
            onDragStart={(event) => event.preventDefault()}
          >
            {open ? (
              <ChevronDown className="size-3.5 shrink-0" />
            ) : (
              <ChevronRight className="size-3.5 shrink-0" />
            )}
            <Folder className="size-3.5 shrink-0 text-primary/70" />
            <span className="min-w-0 flex-1 truncate text-left">{folder.name}</span>
            {isEmpty && <span className="explorer-count-badge">Empty</span>}
          </button>
        </CollapsibleTrigger>
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
      <CollapsibleContent className="explorer-tree-nested space-y-0.5">
        {folder.requests.map((item) => (
          <CollectionItem
            key={item.id}
            item={item}
            folders={folders}
            dndEnabled={dndEnabled}
            selected={requestSignature(item.request) === activeSignature}
            onOpen={() => onOpen(item)}
            onPreview={onPreview ? () => onPreview(item) : undefined}
            onDuplicate={() => onDuplicate(item.id)}
            onDelete={() => onDelete(item.id, item.name)}
            onMove={(targetFolder) => onMove(item.id, targetFolder)}
            onRelocate={(draggedId, position) =>
              onRelocateRequest(draggedId, {
                folder: folder.path,
                targetId: item.id,
                position,
              })
            }
          />
        ))}
        {folder.children.map((child) => (
          <FolderBranch
            key={child.path}
            folder={child}
            collectionId={collectionId}
            collectionName={collectionName}
            folders={folders}
            dndEnabled={dndEnabled}
            activeSignature={activeSignature}
            isFolderOpen={isFolderOpen}
            setFolderOpen={setFolderOpen}
            onOpen={onOpen}
            onPreview={onPreview}
            onDuplicate={onDuplicate}
            onDelete={onDelete}
            onDeleteFolder={onDeleteFolder}
            onMove={onMove}
            onRelocateRequest={onRelocateRequest}
            onReorderFolder={onReorderFolder}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

function CollectionItem({
  item,
  folders,
  dndEnabled,
  selected,
  onOpen,
  onPreview,
  onDuplicate,
  onDelete,
  onMove,
  onRelocate,
}: {
  item: SavedRequest;
  folders: string[];
  dndEnabled: boolean;
  selected?: boolean;
  onOpen: () => void;
  onPreview?: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMove: (folder?: string) => void;
  onRelocate?: (draggedId: string, position: "before" | "after") => void;
}) {
  const [dropEdge, setDropEdge] = useState<"before" | "after" | null>(null);

  return (
    <div
      className={cn(
        "group/item relative flex items-center gap-0.5 rounded-md",
        dropEdge === "before" &&
          "before:absolute before:inset-x-1 before:top-0 before:h-0.5 before:rounded-full before:bg-primary",
        dropEdge === "after" &&
          "after:absolute after:inset-x-1 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary",
      )}
      onDragOver={(event) => {
        if (!dndEnabled || !onRelocate || !isCollectionDragEvent(event)) return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = "move";
        setDropEdge(dropPositionFromEvent(event));
      }}
      onDragLeave={() => setDropEdge(null)}
      onDrop={(event) => {
        if (!dndEnabled || !onRelocate) return;
        event.preventDefault();
        event.stopPropagation();
        const payload = readCollectionDragPayload(event.dataTransfer);
        const edge = dropEdge ?? dropPositionFromEvent(event);
        setDropEdge(null);
        endCollectionDrag();
        if (!payload || payload.kind !== "request") return;
        if (payload.id === item.id) return;
        if (payload.collectionId !== item.collectionId) return;
        onRelocate(payload.id, edge);
      }}
    >
      {dndEnabled && (
        <button
          type="button"
          className="flex size-7 shrink-0 cursor-grab items-center justify-center text-muted-foreground opacity-70 hover:opacity-100 active:cursor-grabbing"
          draggable
          title="Drag request"
          aria-label="Drag request"
          onClick={(event) => event.preventDefault()}
          onPointerDown={(event) => event.stopPropagation()}
          onDragStart={(event) => {
            event.stopPropagation();
            beginCollectionDrag(event, {
              kind: "request",
              id: item.id,
              collectionId: item.collectionId,
            });
          }}
          onDragEnd={() => endCollectionDrag()}
        >
          <GripVertical className="size-3.5" />
        </button>
      )}
      <button
        type="button"
        draggable={false}
        className={cn("explorer-tree-row min-w-0 flex-1", selected && "explorer-tree-row--active")}
        onClick={onOpen}
        onDragStart={(event) => event.preventDefault()}
      >
        <span className={cn("explorer-method", methodTextClass(item.request.method))}>
          {methodShortLabel(item.request.method)}
        </span>
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
          {onPreview && (
            <>
              <DropdownMenuItem onClick={onPreview}>
                <Eye className="size-3.5" />
                View details
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function PreviewSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
        {label}
      </p>
      <div className="rounded-md border border-border/50 bg-background/40 p-2.5">{children}</div>
    </div>
  );
}

function RequestPreviewPanel({
  target,
  onClose,
  onOpen,
}: {
  target: PreviewTarget;
  onClose: () => void;
  onOpen: () => void;
}) {
  const req = target.kind === "collection" ? target.item.request : target.entry.request;
  const response = target.kind === "history" ? target.entry.response : null;
  const displayName = requestDisplayName(req);
  const enabledHeaders = req.headers.filter((h) => h.enabled && h.key);
  const enabledQuery = req.query.filter((q) => q.enabled && q.key);
  const hasBody = req.bodyKind !== "none";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-1.5 border-b border-sidebar-border px-2 py-1.5">
        <button
          type="button"
          className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[12px] text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
          onClick={onClose}
        >
          <ArrowLeft className="size-3.5" />
          Back
        </button>
        <span className="min-w-0 flex-1 truncate text-center text-[12px] font-medium text-foreground/60">
          {displayName ?? "Request detail"}
        </span>
        <Button type="button" size="sm" className="h-7 gap-1.5 px-3 text-[12px]" onClick={onOpen}>
          <ExternalLink className="size-3" />
          Open
        </Button>
      </div>

      <ScrollAreaWithTop
        className="min-h-0 flex-1"
        resetKey={target.kind === "collection" ? target.item.id : target.entry.id}
      >
        <div className="space-y-3 p-3">
          <div className="space-y-1.5">
            {displayName && (
              <p className="text-[13px] font-semibold text-foreground">{displayName}</p>
            )}
            <div className="flex min-w-0 items-start gap-2">
              <MethodBadge method={req.method} />
              <p className="min-w-0 break-all font-mono text-[11px] leading-relaxed text-muted-foreground">
                {req.url || <span className="italic opacity-50">No URL set</span>}
              </p>
            </div>
          </div>

          {response && (
            <PreviewSection label="Last response">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold",
                    statusBadgeClass(response.status),
                  )}
                >
                  {response.status}
                </span>
                <span className="text-[11px] text-muted-foreground">{response.elapsedMs} ms</span>
                <span className="text-[11px] text-muted-foreground">
                  {formatBytes(response.sizeBytes)}
                </span>
              </div>
            </PreviewSection>
          )}

          {req.auth.authType !== "none" && (
            <PreviewSection label="Auth">
              <p className="text-[12px] capitalize text-foreground/80">{req.auth.authType}</p>
            </PreviewSection>
          )}

          {enabledHeaders.length > 0 && (
            <PreviewSection label={`Headers · ${enabledHeaders.length}`}>
              <div className="space-y-1.5">
                {enabledHeaders.slice(0, 10).map((h) => (
                  <div key={h.id} className="flex min-w-0 gap-1.5 font-mono text-[11px]">
                    <span className="shrink-0 font-medium text-foreground/80">{h.key}:</span>
                    <span className="min-w-0 break-all text-muted-foreground">
                      {h.value || <span className="italic opacity-40">empty</span>}
                    </span>
                  </div>
                ))}
                {enabledHeaders.length > 10 && (
                  <p className="text-[11px] italic text-muted-foreground">
                    +{enabledHeaders.length - 10} more
                  </p>
                )}
              </div>
            </PreviewSection>
          )}

          {enabledQuery.length > 0 && (
            <PreviewSection label={`Query params · ${enabledQuery.length}`}>
              <div className="space-y-1.5">
                {enabledQuery.map((q) => (
                  <div key={q.id} className="flex min-w-0 gap-1.5 font-mono text-[11px]">
                    <span className="shrink-0 font-medium text-foreground/80">{q.key}:</span>
                    <span className="min-w-0 break-all text-muted-foreground">
                      {q.value || <span className="italic opacity-40">empty</span>}
                    </span>
                  </div>
                ))}
              </div>
            </PreviewSection>
          )}

          {hasBody && (
            <PreviewSection label={`Body · ${req.bodyKind}`}>
              {req.body ? (
                <pre className="min-w-0 overflow-hidden whitespace-pre-wrap break-all font-mono text-[10px] leading-relaxed text-muted-foreground">
                  {req.body.slice(0, 400)}
                  {req.body.length > 400 && (
                    <span className="italic opacity-50">… ({req.body.length - 400} more chars)</span>
                  )}
                </pre>
              ) : (
                <p className="text-[11px] italic text-muted-foreground opacity-50">Empty body</p>
              )}
            </PreviewSection>
          )}

          {target.kind === "collection" && (
            <PreviewSection label="Collection">
              <p className="text-[12px] text-foreground/80">
                {target.item.folder ? (
                  <span className="text-muted-foreground">{target.item.folder} / </span>
                ) : null}
                <span className="font-medium">{target.item.name}</span>
              </p>
            </PreviewSection>
          )}

          {target.kind === "history" && (
            <PreviewSection label="Sent">
              <p className="text-[12px] text-foreground/80">
                {new Date(target.entry.sentAt).toLocaleString()} ·{" "}
                <span className="text-muted-foreground">{relativeTime(target.entry.sentAt)}</span>
              </p>
            </PreviewSection>
          )}
        </div>
      </ScrollAreaWithTop>
    </div>
  );
}
