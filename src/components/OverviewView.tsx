import { useEffect, useMemo, useRef, useState } from "react";
import {
  ClipboardCopy,
  Clock3,
  FolderOpen,
  History,
  LoaderCircle,
  MoreHorizontal,
  Search,
  Send,
} from "lucide-react";
import { useApp } from "@/machines";
import { useHistory } from "@/hooks/useHistory";
import {
  buildOverviewItems,
  filterHistoryEntries,
  filterOverviewItems,
  filterOverviewItemsAsync,
  isOverviewFilterDefault,
} from "@/lib/filters";
import {
  HISTORY_OVERVIEW_LIMIT,
  listHistoryPage,
  searchHistoryEntries,
} from "@/lib/history-client";
import { focusPulseFieldWhenReady, formatModShortcut } from "@/lib/hotkeys";
import { toast } from "@/lib/toast";
import { useDebouncedSearch } from "@/lib/use-debounced-search";
import type { HistoryEntry } from "@/types";
import { EmptyState } from "@/components/EmptyState";
import { MethodBadge } from "@/components/MethodBadge";
import { PageShell, PageToolbar } from "@/components/PageShell";
import {
  ActiveOverviewFilters,
  OverviewFilterMenu,
} from "@/components/OverviewFilterMenu";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Panel, StatCard } from "@/components/ui/panel";
import { Separator } from "@/components/ui/separator";

export function OverviewView() {
  const {
    loadHistoryEntry,
    collections,
    collectionGroups,
    loadSavedRequest,
    newRequestTab,
    tabs,
    user,
    overviewFilter,
    setOverviewFilter,
    resetOverviewFilter,
  } = useApp();

  const { totalCount: historyCount } = useHistory();
  const [overviewHistory, setOverviewHistory] = useState<HistoryEntry[]>([]);
  const [searchedHistory, setSearchedHistory] = useState<HistoryEntry[] | null>(null);
  const [searching, setSearching] = useState(false);

  const search = useDebouncedSearch(overviewFilter.query, { delayMs: 180 });
  const debouncedQuery = search.debouncedValue;
  const loadHistoryEntryRef = useRef(loadHistoryEntry);
  const loadSavedRequestRef = useRef(loadSavedRequest);

  loadHistoryEntryRef.current = loadHistoryEntry;
  loadSavedRequestRef.current = loadSavedRequest;

  useEffect(() => {
    let cancelled = false;
    void listHistoryPage(0, HISTORY_OVERVIEW_LIMIT).then((page) => {
      if (!cancelled) setOverviewHistory(page.items);
    });
    return () => {
      cancelled = true;
    };
  }, [historyCount]);

  useEffect(() => {
    const query = debouncedQuery.trim();
    if (!query) {
      setSearchedHistory(null);
      setSearching(false);
      return;
    }

    let cancelled = false;
    setSearching(true);
    void searchHistoryEntries(query, HISTORY_OVERVIEW_LIMIT)
      .then((results) => {
        if (!cancelled) setSearchedHistory(results);
      })
      .finally(() => {
        if (!cancelled) setSearching(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  const historyForOverview = useMemo(() => {
    if (!search.query) return overviewHistory;
    if (searchedHistory) return searchedHistory;
    return filterHistoryEntries(overviewHistory, search.query);
  }, [overviewHistory, search.query, searchedHistory]);

  const allItems = useMemo(
    () =>
      buildOverviewItems(historyForOverview, collections, {
        onHistory: (entry) => loadHistoryEntryRef.current(entry),
        onSaved: (item) => loadSavedRequestRef.current(item),
      }),
    [collections, historyForOverview],
  );

  const activeFilter = useMemo(
    () => ({
      ...overviewFilter,
      query: search.query,
    }),
    [overviewFilter, search.query],
  );

  const filteredItemsSync = useMemo(
    () => filterOverviewItems(allItems, activeFilter),
    [allItems, activeFilter],
  );

  const [asyncFilteredItems, setAsyncFilteredItems] = useState<typeof filteredItemsSync | null>(
    null,
  );

  useEffect(() => {
    if (!search.debouncedQuery) {
      setAsyncFilteredItems(null);
      return;
    }

    let cancelled = false;
    const debouncedFilter = { ...overviewFilter, query: search.debouncedQuery };
    void filterOverviewItemsAsync(allItems, debouncedFilter).then((next) => {
      if (!cancelled) setAsyncFilteredItems(next);
    });

    return () => {
      cancelled = true;
    };
  }, [allItems, overviewFilter, search.debouncedQuery]);

  const filteredItems = asyncFilteredItems ?? filteredItemsSync;
  const recentItems = useMemo(() => filteredItems.slice(0, 20), [filteredItems]);
  const firstName = (user?.name ?? "there").split(" ")[0];
  const filtersActive = !isOverviewFilterDefault(overviewFilter);

  const openNewRequest = () => {
    newRequestTab();
    focusPulseFieldWhenReady("url");
  };

  const copyUrl = async (url: string) => {
    if (!url.trim()) {
      toast.info("No URL to copy");
      return;
    }
    await navigator.clipboard.writeText(url);
    toast.success("URL copied");
  };

  return (
    <PageShell resetKey="overview">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-caption">Workspace</p>
          <p className="mt-1 text-heading">
            Welcome back, {firstName}
          </p>
        </div>
        <Button className="h-9" onClick={openNewRequest}>
          <Send className="size-3.5" />
          New request
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Collections" value={collectionGroups.length} />
        <StatCard label="History" value={historyCount} />
        <StatCard label="Open tabs" value={tabs.length} />
      </div>

      <PageToolbar>
        <div className="relative min-w-[200px] flex-1 sm:max-w-sm">
          {search.isPending || searching ? (
            <LoaderCircle className="absolute left-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          ) : (
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          )}
          <Input
            className="h-9 pl-9 pr-14"
            placeholder="Search requests, URLs, methods…"
            value={overviewFilter.query}
            onChange={(event) => setOverviewFilter({ query: event.target.value })}
            aria-busy={search.isPending || searching}
            data-pulse-focus="overview-search"
          />
          <kbd className="ui-kbd pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 hidden sm:inline">
            {formatModShortcut("F")}
          </kbd>
        </div>
        <OverviewFilterMenu totalCount={allItems.length} filteredCount={filteredItems.length} />
      </PageToolbar>

      <ActiveOverviewFilters
        filter={overviewFilter}
        onChange={setOverviewFilter}
        onReset={resetOverviewFilter}
      />

      {filtersActive && (
        <p className="text-body text-muted-foreground">
          Showing {filteredItems.length} of {allItems.length} items
          {debouncedQuery.trim() ? " · ranked by relevance" : ""}
        </p>
      )}

      <Panel>
        <div className="ui-data-table-header grid-cols-[minmax(0,1fr)_72px_minmax(100px,1fr)_40px]">
          <span>Name</span>
          <span>Method</span>
          <span>Details</span>
          <span />
        </div>

        {recentItems.length === 0 ? (
          <div className="p-3">
            <EmptyState
              icon={filtersActive ? Search : Send}
              title={filtersActive ? "No matches" : "Nothing here yet"}
              description={
                filtersActive
                  ? "Try a different query or clear filters."
                  : "Send a request or save one to a collection — it will show up here."
              }
              action={
                filtersActive ? (
                  <Button type="button" variant="outline" size="sm" onClick={resetOverviewFilter}>
                    Clear filters
                  </Button>
                ) : (
                  <Button type="button" size="sm" onClick={openNewRequest}>
                    New request
                  </Button>
                )
              }
            />
          </div>
        ) : (
          recentItems.map((item, index) => (
            <div key={item.id}>
              <div className="ui-data-table-row group/row grid-cols-[minmax(0,1fr)_40px] sm:grid-cols-[minmax(0,1fr)_72px_minmax(100px,1fr)_40px]">
                <button
                  type="button"
                  className="col-span-1 grid min-w-0 grid-cols-1 gap-1 text-left sm:col-span-3 sm:grid-cols-[minmax(0,1fr)_72px_minmax(100px,1fr)] sm:items-center sm:gap-4"
                  onClick={item.onOpen}
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-body font-medium">{item.title}</span>
                      <span className="hidden shrink-0 rounded-md bg-muted/80 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:inline">
                        {item.source === "history" ? "History" : "Saved"}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
                      {item.subtitle}
                    </span>
                  </span>
                  <span className="hidden sm:block">
                    <MethodBadge method={item.method} />
                  </span>
                  <span className="hidden items-center gap-2 text-[12px] text-muted-foreground sm:flex">
                    {item.source === "history" ? (
                      <Clock3 className="size-3.5 shrink-0" />
                    ) : (
                      <FolderOpen className="size-3.5 shrink-0" />
                    )}
                    <span className="truncate">{item.meta}</span>
                  </span>
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="flex size-8 items-center justify-center rounded-lg text-muted-foreground opacity-70 transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover/row:opacity-100 data-[state=open]:opacity-100 sm:opacity-0"
                      aria-label="More actions"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <MoreHorizontal className="size-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={item.onOpen}>
                      {item.source === "history" ? (
                        <History className="size-4" />
                      ) : (
                        <FolderOpen className="size-4" />
                      )}
                      Open
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => void copyUrl(item.subtitle)}>
                      <ClipboardCopy className="size-4" />
                      Copy URL
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              {index < recentItems.length - 1 && <Separator />}
            </div>
          ))
        )}
      </Panel>
    </PageShell>
  );
}
