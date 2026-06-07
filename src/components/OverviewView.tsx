import { useEffect, useMemo, useState } from "react";
import { Clock3, MoreHorizontal, Search } from "lucide-react";
import { useApp } from "@/machines";
import {
  buildOverviewItems,
  filterOverviewItems,
  filterOverviewItemsAsync,
  isOverviewFilterDefault,
} from "@/lib/filters";
import { useDebouncedValue } from "@/lib/use-debounced-search";
import { MethodBadge } from "@/components/MethodBadge";
import {
  ActiveOverviewFilters,
  OverviewFilterMenu,
} from "@/components/OverviewFilterMenu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollAreaWithTop } from "@/components/ui/scroll-area-with-top";
import { Separator } from "@/components/ui/separator";

export function OverviewView() {
  const {
    history,
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

  const debouncedQuery = useDebouncedValue(overviewFilter.query);

  const allItems = useMemo(
    () =>
      buildOverviewItems(history, collections, {
        onHistory: loadHistoryEntry,
        onSaved: loadSavedRequest,
      }),
    [collections, history, loadHistoryEntry, loadSavedRequest],
  );

  const activeFilter = useMemo(
    () => ({
      ...overviewFilter,
      query: debouncedQuery,
    }),
    [overviewFilter, debouncedQuery],
  );

  const filteredItemsSync = useMemo(
    () => filterOverviewItems(allItems, activeFilter),
    [allItems, activeFilter],
  );

  const [filteredItems, setFilteredItems] = useState(filteredItemsSync);

  useEffect(() => {
    setFilteredItems(filteredItemsSync);

    if (!debouncedQuery.trim()) return;

    let cancelled = false;
    void filterOverviewItemsAsync(allItems, activeFilter).then((next) => {
      if (!cancelled) setFilteredItems(next);
    });

    return () => {
      cancelled = true;
    };
  }, [allItems, activeFilter, debouncedQuery, filteredItemsSync]);

  const recentItems = useMemo(() => filteredItems.slice(0, 20), [filteredItems]);

  return (
    <ScrollAreaWithTop className="h-full min-h-0" resetKey="overview">
      <div className="mx-auto max-w-5xl space-y-6 p-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Welcome back, {(user?.name ?? "there").split(" ")[0]}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Recent requests and saved endpoints across your workspace.
          </p>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Fuzzy search requests, URLs, methods…"
                value={overviewFilter.query}
                onChange={(event) => setOverviewFilter({ query: event.target.value })}
              />
            </div>
            <OverviewFilterMenu totalCount={allItems.length} filteredCount={filteredItems.length} />
            <Button variant="secondary" onClick={newRequestTab}>
              New request
            </Button>
          </div>

          <ActiveOverviewFilters
            filter={overviewFilter}
            onChange={setOverviewFilter}
            onReset={resetOverviewFilter}
          />

          {!isOverviewFilterDefault(overviewFilter) && (
            <p className="text-xs text-muted-foreground">
              Showing {filteredItems.length} of {allItems.length} items
              {debouncedQuery.trim() ? " · ranked by relevance" : ""}
            </p>
          )}
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="grid grid-cols-[1fr_120px_160px_40px] gap-4 border-b border-border bg-muted/40 px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <span>Name</span>
            <span>Method</span>
            <span>Details</span>
            <span />
          </div>

          {recentItems.length === 0 ? (
            <div className="space-y-2 px-4 py-12 text-center text-sm text-muted-foreground">
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
                <div className="grid w-full grid-cols-[1fr_120px_160px_40px] items-center gap-4 px-4 py-4 hover:bg-muted/30">
                  <button type="button" className="min-w-0 text-left" onClick={item.onOpen}>
                    <p className="truncate text-sm font-medium">{item.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{item.subtitle}</p>
                  </button>
                  <button type="button" className="text-left" onClick={item.onOpen}>
                    <MethodBadge method={item.method} />
                  </button>
                  <button
                    type="button"
                    className="flex items-center gap-2 text-left text-xs text-muted-foreground"
                    onClick={item.onOpen}
                  >
                    <Clock3 className="size-3.5" />
                    {item.meta}
                  </button>
                  <Button type="button" variant="ghost" size="icon" className="size-8">
                    <MoreHorizontal className="size-4" />
                  </Button>
                </div>
                {index < recentItems.length - 1 && <Separator />}
              </div>
            ))
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Collections</p>
            <p className="mt-2 text-2xl font-semibold">{collectionGroups.length}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">History</p>
            <p className="mt-2 text-2xl font-semibold">{history.length}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Open tabs</p>
            <p className="mt-2 text-2xl font-semibold">{tabs.length}</p>
          </div>
        </div>
      </div>
    </ScrollAreaWithTop>
  );
}
