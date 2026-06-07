import type { HttpMethod, HistoryEntry, SavedRequest } from "@/types";

export type OverviewFilter = {
  query: string;
  method: HttpMethod | "ALL";
  source: "all" | "history" | "collections";
  status: "all" | "2xx" | "4xx" | "5xx";
};

export const defaultOverviewFilter = (): OverviewFilter => ({
  query: "",
  method: "ALL",
  source: "all",
  status: "all",
});

export type FilterableItem = {
  id: string;
  title: string;
  subtitle: string;
  method: HttpMethod;
  meta: string;
  status?: number;
  source: "history" | "collections";
  onOpen: () => void;
};

function matchesStatus(status: number | undefined, filter: OverviewFilter["status"]): boolean {
  if (filter === "all" || status == null) return filter === "all" || status == null;
  if (filter === "2xx") return status >= 200 && status < 300;
  if (filter === "4xx") return status >= 400 && status < 500;
  if (filter === "5xx") return status >= 500 && status < 600;
  return true;
}

export function filterOverviewItems(items: FilterableItem[], filter: OverviewFilter): FilterableItem[] {
  const query = filter.query.trim().toLowerCase();

  return items.filter((item) => {
    if (filter.source !== "all" && item.source !== filter.source) return false;
    if (filter.method !== "ALL" && item.method !== filter.method) return false;
    if (!matchesStatus(item.status, filter.status)) return false;
    if (!query) return true;

    return (
      item.title.toLowerCase().includes(query) ||
      item.subtitle.toLowerCase().includes(query) ||
      item.meta.toLowerCase().includes(query) ||
      item.method.toLowerCase().includes(query)
    );
  });
}

export function buildOverviewItems(
  history: HistoryEntry[],
  collections: SavedRequest[],
  handlers: {
    onHistory: (entry: HistoryEntry) => void;
    onSaved: (item: SavedRequest) => void;
  },
): FilterableItem[] {
  const historyItems = history.map((entry) => ({
    id: entry.id,
    title: entry.request.name || entry.request.url,
    subtitle: entry.request.url,
    method: entry.request.method,
    meta: entry.response
      ? `${entry.response.status} · ${entry.response.elapsedMs} ms`
      : "Not sent",
    status: entry.response?.status,
    source: "history" as const,
    onOpen: () => handlers.onHistory(entry),
  }));

  const collectionItems = collections.map((item) => ({
    id: item.id,
    title: item.name,
    subtitle: item.request.url,
    method: item.request.method,
    meta: item.folder ?? "Collection",
    source: "collections" as const,
    onOpen: () => handlers.onSaved(item),
  }));

  return [...historyItems, ...collectionItems];
}

export function filterSavedRequests(requests: SavedRequest[], query: string): SavedRequest[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return requests;

  return requests.filter(
    (item) =>
      item.name.toLowerCase().includes(normalized) ||
      item.request.url.toLowerCase().includes(normalized) ||
      item.folder?.toLowerCase().includes(normalized),
  );
}

export function filterHistoryEntries(entries: HistoryEntry[], query: string): HistoryEntry[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return entries;

  return entries.filter(
    (entry) =>
      entry.request.name.toLowerCase().includes(normalized) ||
      entry.request.url.toLowerCase().includes(normalized),
  );
}
