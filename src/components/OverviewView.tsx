import { useMemo } from "react";
import { Clock3, MoreHorizontal, Search } from "lucide-react";
import { useApp } from "@/machines";
import { MethodBadge } from "@/components/MethodBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

export function OverviewView() {
  const { history, loadHistoryEntry, collections, collectionGroups, loadSavedRequest, newRequestTab, tabs } =
    useApp();

  const recentItems = useMemo(() => {
    const fromHistory = history.slice(0, 8).map((entry) => ({
      id: entry.id,
      title: entry.request.name || entry.request.url,
      subtitle: entry.request.url,
      method: entry.request.method,
      meta: entry.response
        ? `${entry.response.status} · ${entry.response.elapsedMs} ms`
        : "Not sent",
      onOpen: () => loadHistoryEntry(entry),
    }));

    if (fromHistory.length > 0) return fromHistory;

    return collections.slice(0, 8).map((item) => ({
      id: item.id,
      title: item.name,
      subtitle: item.request.url,
      method: item.request.method,
      meta: item.folder ?? "Collection",
      onOpen: () => loadSavedRequest(item),
    }));
  }, [collections, history, loadHistoryEntry, loadSavedRequest]);

  return (
    <ScrollArea className="h-full">
      <div className="mx-auto max-w-5xl space-y-6 p-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Recent requests and saved endpoints across your workspace.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search requests" />
          </div>
          <Button variant="outline">Filter</Button>
          <Button variant="secondary" onClick={newRequestTab}>
            New request
          </Button>
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="grid grid-cols-[1fr_120px_160px_40px] gap-4 border-b border-border bg-muted/40 px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <span>Name</span>
            <span>Method</span>
            <span>Details</span>
            <span />
          </div>

          {recentItems.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-muted-foreground">
              No recent activity yet. Open a request from the sidebar or create a new tab.
            </div>
          ) : (
            recentItems.map((item, index) => (
              <div key={item.id}>
                <div className="grid w-full grid-cols-[1fr_120px_160px_40px] items-center gap-4 px-4 py-4 hover:bg-muted/30">
                  <button
                    type="button"
                    className="min-w-0 text-left"
                    onClick={item.onOpen}
                  >
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
    </ScrollArea>
  );
}
