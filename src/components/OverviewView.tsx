import { useEffect, useMemo, useRef, useState } from "react";
import { Clock3, LoaderCircle, MoreHorizontal, Search } from "lucide-react";
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
import { useDebouncedSearch } from "@/lib/use-debounced-search";
import type { HistoryEntry } from "@/types";
import { MethodBadge } from "@/components/MethodBadge";
import { PageShell, PageToolbar } from "@/components/PageShell";
import {
  ActiveOverviewFilters,
  OverviewFilterMenu,
} from "@/components/OverviewFilterMenu";
import { TooltipIconButton } from "@/components/TooltipIconButton";
import { Button } from "@/components/ui/button";
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

  return (
    <PageShell resetKey="overview">
      <p className="text-body text-muted-foreground">
        Welcome back, <span className="font-medium text-foreground">{firstName}</span>
      </p>

      <PageToolbar>
        <div className="relative min-w-[200px] flex-1 sm:max-w-sm">
          {search.isPending || searching ? (
            <LoaderCircle className="absolute left-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          ) : (
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          )}
          <Input
            className="h-9 pl-9"
            placeholder="Search requests, URLs, methods…"
            value={overviewFilter.query}
            onChange={(event) => setOverviewFilter({ query: event.target.value })}
            aria-busy={search.isPending || searching}
          />
        </div>
        <OverviewFilterMenu totalCount={allItems.length} filteredCount={filteredItems.length} />
        <Button className="h-9" onClick={newRequestTab}>
          New request
        </Button>
      </PageToolbar>

      <ActiveOverviewFilters
        filter={overviewFilter}
        onChange={setOverviewFilter}
        onReset={resetOverviewFilter}
      />

      {!isOverviewFilterDefault(overviewFilter) && (
        <p className="text-body text-muted-foreground">
          Showing {filteredItems.length} of {allItems.length} items
          {debouncedQuery.trim() ? " · ranked by relevance" : ""}
        </p>
      )}

      <Panel>
        <div className="ui-data-table-header grid-cols-[1fr_120px_160px_40px]">
          <span>Name</span>
          <span>Method</span>
          <span>Details</span>
          <span />
        </div>

        {recentItems.length === 0 ? (
          <div className="space-y-2 px-4 py-12 text-center text-body text-muted-foreground">
            <p>No items match your search or filters.</p>
            {!isOverviewFilterDefault(overviewFilter) && (
              <Button type="button" variant="link" className="h-auto p-0" onClick={resetOverviewFilter}>
                Clear filters
              </Button>
            )}
          </div>
        ) : (
          recentItems.map((item, index) => (
            <div key={item.id}>
              <div className="ui-data-table-row grid-cols-[1fr_120px_160px_40px]">
                <button type="button" className="min-w-0 text-left" onClick={item.onOpen}>
                  <p className="truncate text-body font-medium">{item.title}</p>
                  <p className="truncate text-[12px] text-muted-foreground">{item.subtitle}</p>
                </button>
                <button type="button" className="text-left" onClick={item.onOpen}>
                  <MethodBadge method={item.method} />
                </button>
                <button
                  type="button"
                  className="flex items-center gap-2 text-left text-[12px] text-muted-foreground"
                  onClick={item.onOpen}
                >
                  <Clock3 className="size-3.5" />
                  {item.meta}
                </button>
                <TooltipIconButton
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  label="More actions"
                >
                  <MoreHorizontal className="size-4" />
                </TooltipIconButton>
              </div>
              {index < recentItems.length - 1 && <Separator />}
            </div>
          ))
        )}
      </Panel>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Collections" value={collectionGroups.length} />
        <StatCard label="History" value={historyCount} />
        <StatCard label="Open tabs" value={tabs.length} />
      </div>
    </PageShell>
  );
}
