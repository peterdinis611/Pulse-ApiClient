import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  Folder,
  Globe2,
  History,
  LayoutGrid,
  LoaderCircle,
  Play,
  Plus,
  Search,
  Settings,
  Trash2,
  Upload,
} from "lucide-react";
import { useApp } from "@/machines";
import { groupRequestsByFolder, requestsForCollection } from "@/lib/collections";
import { runCollection, type CollectionRunResult } from "@/lib/collection-runner";
import { filterHistoryEntries, filterHistoryEntriesAsync, filterSavedRequests, filterSavedRequestsAsync } from "@/lib/filters";
import { useDebouncedValue } from "@/lib/use-debounced-search";
import { toast } from "@/lib/toast";
import type { FolderTreeNode } from "@/lib/collections";
import { CollectionRunResultsPanel } from "@/components/CollectionRunResultsPanel";
import { MethodBadge } from "@/components/MethodBadge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollAreaWithTop } from "@/components/ui/scroll-area-with-top";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { HistoryEntry, SavedRequest } from "@/types";

export function Sidebar() {
  const {
    sidebarSearch,
    setSidebarSearch,
    mainView,
    setMainView,
    collectionGroups,
    collections,
    history,
    environments,
    activeEnvironmentId,
    setActiveEnvironmentId,
    loadSavedRequest,
    deleteSavedRequest,
    duplicateSavedRequest,
    loadHistoryEntry,
    exportCollections,
    importCollections,
    addEnvironment,
    activeEnvironment,
  } = useApp();

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

  const filteredHistorySync = useMemo(() => {
    return filterHistoryEntries(history, debouncedSidebarSearch);
  }, [history, debouncedSidebarSearch]);

  const [asyncFilteredCollections, setAsyncFilteredCollections] = useState<SavedRequest[] | null>(
    null,
  );
  const [asyncFilteredHistory, setAsyncFilteredHistory] = useState<HistoryEntry[] | null>(null);

  useEffect(() => {
    if (!debouncedSidebarSearch.trim()) {
      setAsyncFilteredCollections(null);
      setAsyncFilteredHistory(null);
      return;
    }

    let cancelled = false;
    void Promise.all([
      filterSavedRequestsAsync(collections, debouncedSidebarSearch),
      filterHistoryEntriesAsync(history, debouncedSidebarSearch),
    ]).then(([nextCollections, nextHistory]) => {
      if (cancelled) return;
      setAsyncFilteredCollections(nextCollections);
      setAsyncFilteredHistory(nextHistory.slice(0, 50));
    });

    return () => {
      cancelled = true;
    };
  }, [collections, history, debouncedSidebarSearch]);

  const filteredCollections = asyncFilteredCollections ?? filteredCollectionsSync;
  const filteredHistory = (asyncFilteredHistory ?? filteredHistorySync).slice(0, 50);

  const handleRunCollection = async (collectionId: string, collectionName: string) => {
    const items = requestsForCollection(collections, collectionId);
    if (items.length === 0 || runningCollectionId) return;

    setRunningCollectionId(collectionId);
    setCollectionRun(null);
    setRunProgress(`Running 0/${items.length}`);

    try {
      const result = await runCollection(
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
    <aside className="flex min-h-0 w-[280px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="space-y-3 border-b border-sidebar-border p-3">
        <div className="space-y-2">
          <Label htmlFor="sidebar-env" className="text-xs text-muted-foreground">
            Environment
          </Label>
          <Select
            value={activeEnvironmentId ?? undefined}
            onValueChange={(value) => setActiveEnvironmentId(value)}
          >
            <SelectTrigger id="sidebar-env" className="h-9 bg-background">
              <SelectValue placeholder="Select environment" />
            </SelectTrigger>
            <SelectContent>
              {environments.map((env) => (
                <SelectItem key={env.id} value={env.id}>
                  {env.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={sidebarSearch}
            onChange={(event) => setSidebarSearch(event.target.value)}
            className="h-9 bg-background pl-9 pr-12"
            placeholder="Fuzzy search collections & history"
          />
          <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            ⌘K
          </kbd>
        </div>
      </div>

      <ScrollAreaWithTop className="min-h-0 flex-1" resetKey={sidebarSearch}>
        <div className="space-y-1 p-2">
          <SidebarNavItem
            active={mainView === "overview"}
            icon={LayoutGrid}
            label="Overview"
            onClick={() => setMainView("overview")}
          />
          <SidebarNavItem
            active={mainView === "environments"}
            icon={Globe2}
            label="Environments"
            onClick={() => setMainView("environments")}
          />
          <SidebarNavItem
            active={mainView === "settings"}
            icon={Settings}
            label="Settings"
            onClick={() => setMainView("settings")}
          />

          <Separator className="my-2" />

          <Collapsible open={collectionsOpen} onOpenChange={setCollectionsOpen}>
            <div className="flex items-center justify-between px-2 py-1">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  {collectionsOpen ? (
                    <ChevronDown className="size-3.5" />
                  ) : (
                    <ChevronRight className="size-3.5" />
                  )}
                  Collections
                </button>
              </CollapsibleTrigger>
              <div className="flex items-center gap-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  title="Import collection"
                  onClick={() => importRef.current?.click()}
                >
                  <Upload className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  title="Export collections"
                  onClick={() => {
                    const blob = new Blob([exportCollections()], { type: "application/json" });
                    const url = URL.createObjectURL(blob);
                    const anchor = document.createElement("a");
                    anchor.href = url;
                    anchor.download = "pulse-collections.json";
                    anchor.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  <Download className="size-3.5" />
                </Button>
              </div>
              <input
                ref={importRef}
                type="file"
                accept="application/json,.json"
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
                const grouped = groupRequestsByFolder(items);
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
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-3 py-2 text-left hover:bg-sidebar-accent"
                        >
                          {open ? (
                            <ChevronDown className="size-3.5 shrink-0" />
                          ) : (
                            <ChevronRight className="size-3.5 shrink-0" />
                          )}
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">{group.name}</span>
                          <span className="text-xs text-muted-foreground">{items.length}</span>
                        </button>
                      </CollapsibleTrigger>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7 shrink-0"
                        title="Run collection"
                        disabled={items.length === 0 || runningCollectionId !== null}
                        onClick={() => void handleRunCollection(group.id, group.name)}
                      >
                        {runningCollectionId === group.id ? (
                          <LoaderCircle className="size-3.5 animate-spin" />
                        ) : (
                          <Play className="size-3.5" />
                        )}
                      </Button>
                    </div>
                    <CollapsibleContent className="space-y-0.5 pl-2">
                      {grouped.folders.map((folder) => (
                        <FolderBranch
                          key={folder.path}
                          folder={folder}
                          onOpen={loadSavedRequest}
                          onDuplicate={duplicateSavedRequest}
                          onDelete={deleteSavedRequest}
                        />
                      ))}
                      {grouped.root.map((item) => (
                        <CollectionItem
                          key={item.id}
                          item={item}
                          onOpen={() => loadSavedRequest(item)}
                          onDuplicate={() => duplicateSavedRequest(item.id)}
                          onDelete={() => deleteSavedRequest(item.id)}
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

          <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center gap-1 px-2 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                {historyOpen ? (
                  <ChevronDown className="size-3.5" />
                ) : (
                  <ChevronRight className="size-3.5" />
                )}
                <History className="size-3.5" />
                History
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-0.5">
              {filteredHistory.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left hover:bg-sidebar-accent"
                  onClick={() => loadHistoryEntry(entry)}
                >
                  <MethodBadge method={entry.request.method} />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {entry.request.name || entry.request.url}
                  </span>
                </button>
              ))}
              {filteredHistory.length === 0 && (
                <p className="px-3 py-2 text-xs text-muted-foreground">No history yet</p>
              )}
            </CollapsibleContent>
          </Collapsible>
        </div>
      </ScrollAreaWithTop>

      {(runProgress || collectionRun) && (
        <div className="border-t border-sidebar-border px-3 py-2 text-xs text-muted-foreground">
          {runProgress && <p>{runProgress}</p>}
          {collectionRun && collectionRun.totalTests > 0 && (
            <p className={collectionRun.failed > 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"}>
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

      <div className="border-t border-sidebar-border p-2">
        <Button variant="outline" size="sm" className="w-full" onClick={addEnvironment}>
          <Plus />
          New environment
        </Button>
      </div>
    </aside>
  );
}

function FolderBranch({
  folder,
  onOpen,
  onDuplicate,
  onDelete,
}: {
  folder: FolderTreeNode;
  onOpen: (item: SavedRequest) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className="space-y-0.5">
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm text-muted-foreground hover:bg-sidebar-accent"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        <Folder className="size-3.5" />
        <span className="truncate">{folder.name}</span>
      </button>
      {open && (
        <div className="space-y-0.5 pl-4">
          {folder.requests.map((item) => (
            <CollectionItem
              key={item.id}
              item={item}
              onOpen={() => onOpen(item)}
              onDuplicate={() => onDuplicate(item.id)}
              onDelete={() => onDelete(item.id)}
            />
          ))}
          {folder.children.map((child) => (
            <FolderBranch
              key={child.path}
              folder={child}
              onOpen={onOpen}
              onDuplicate={onDuplicate}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SidebarNavItem({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: typeof LayoutGrid;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-foreground hover:bg-muted",
      )}
    >
      <Icon className="size-4" />
      {label}
    </button>
  );
}

function CollectionItem({
  item,
  onOpen,
  onDuplicate,
  onDelete,
}: {
  item: SavedRequest;
  onOpen: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="group flex items-center gap-1 rounded-md pr-1 hover:bg-sidebar-accent">
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left"
        onClick={onOpen}
      >
        <MethodBadge method={item.request.method} />
        <span className="truncate text-sm">{item.name}</span>
      </button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-7 opacity-0 group-hover:opacity-100"
        onClick={(event) => {
          event.stopPropagation();
          onDuplicate();
        }}
      >
        <Copy className="size-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-7 text-destructive opacity-0 group-hover:opacity-100"
        onClick={(event) => {
          event.stopPropagation();
          onDelete();
        }}
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}
