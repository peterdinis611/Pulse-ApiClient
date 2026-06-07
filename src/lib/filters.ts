import type { HttpMethod, HistoryEntry, SavedRequest } from "@/types";
import { HTTP_METHODS } from "@/types";
import {
  fuzzyFilterByIds,
  fuzzyRankIds,
  toHistoryDocument,
  toOverviewDocument,
  toSavedRequestDocument,
  type SearchDocument,
} from "./fuzzy-search";

export type OverviewStatusFilter = "2xx" | "3xx" | "4xx" | "5xx" | "none";

export type OverviewFilter = {
  query: string;
  methods: HttpMethod[];
  sources: Array<"history" | "collections">;
  statuses: OverviewStatusFilter[];
};

export const defaultOverviewFilter = (): OverviewFilter => ({
  query: "",
  methods: [],
  sources: [],
  statuses: [],
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

export function statusBucket(status: number | undefined): OverviewStatusFilter {
  if (status == null) return "none";
  if (status >= 200 && status < 300) return "2xx";
  if (status >= 300 && status < 400) return "3xx";
  if (status >= 400 && status < 500) return "4xx";
  if (status >= 500 && status < 600) return "5xx";
  return "none";
}

export function isOverviewFilterDefault(filter: OverviewFilter): boolean {
  return (
    filter.query.trim().length === 0 &&
    filter.methods.length === 0 &&
    filter.sources.length === 0 &&
    filter.statuses.length === 0
  );
}

export function countActiveOverviewFilters(filter: OverviewFilter): number {
  let count = 0;
  if (filter.query.trim()) count += 1;
  if (filter.methods.length) count += 1;
  if (filter.sources.length) count += 1;
  if (filter.statuses.length) count += 1;
  return count;
}

export function toggleOverviewMethod(
  filter: OverviewFilter,
  method: HttpMethod,
): Partial<OverviewFilter> {
  const methods = filter.methods.includes(method)
    ? filter.methods.filter((item) => item !== method)
    : [...filter.methods, method];
  return { methods };
}

export function toggleOverviewSource(
  filter: OverviewFilter,
  source: "history" | "collections",
): Partial<OverviewFilter> {
  const sources = filter.sources.includes(source)
    ? filter.sources.filter((item) => item !== source)
    : [...filter.sources, source];
  return { sources };
}

export function toggleOverviewStatus(
  filter: OverviewFilter,
  status: OverviewStatusFilter,
): Partial<OverviewFilter> {
  const statuses = filter.statuses.includes(status)
    ? filter.statuses.filter((item) => item !== status)
    : [...filter.statuses, status];
  return { statuses };
}

export function removeOverviewMethod(filter: OverviewFilter, method: HttpMethod): Partial<OverviewFilter> {
  return { methods: filter.methods.filter((item) => item !== method) };
}

export function removeOverviewSource(
  filter: OverviewFilter,
  source: "history" | "collections",
): Partial<OverviewFilter> {
  return { sources: filter.sources.filter((item) => item !== source) };
}

export function removeOverviewStatus(
  filter: OverviewFilter,
  status: OverviewStatusFilter,
): Partial<OverviewFilter> {
  return { statuses: filter.statuses.filter((item) => item !== status) };
}

export function overviewFilterLabels(filter: OverviewFilter): string[] {
  const labels: string[] = [];
  if (filter.query.trim()) labels.push(`Search: ${filter.query.trim()}`);
  filter.methods.forEach((method) => labels.push(method));
  filter.sources.forEach((source) => labels.push(source === "history" ? "History" : "Collections"));
  filter.statuses.forEach((status) => {
    if (status === "none") labels.push("No response");
    else labels.push(status);
  });
  return labels;
}

function applyStructuredOverviewFilters(
  items: FilterableItem[],
  filter: OverviewFilter,
): FilterableItem[] {
  return items.filter((item) => {
    if (filter.sources.length > 0 && !filter.sources.includes(item.source)) return false;
    if (filter.methods.length > 0 && !filter.methods.includes(item.method)) return false;
    if (filter.statuses.length > 0 && !filter.statuses.includes(statusBucket(item.status))) return false;
    return true;
  });
}

export function filterOverviewItems(items: FilterableItem[], filter: OverviewFilter): FilterableItem[] {
  const structurallyFiltered = applyStructuredOverviewFilters(items, filter);
  const query = filter.query.trim();
  if (!query) return structurallyFiltered;

  const documents = structurallyFiltered.map((item) => toOverviewDocument(item));
  const rankedIds = fuzzyRankIds(documents, query);
  return fuzzyFilterByIds(structurallyFiltered, rankedIds);
}

export async function filterOverviewItemsAsync(
  items: FilterableItem[],
  filter: OverviewFilter,
): Promise<FilterableItem[]> {
  const structurallyFiltered = applyStructuredOverviewFilters(items, filter);
  const query = filter.query.trim();
  if (!query) return structurallyFiltered;

  const documents = structurallyFiltered.map((item) => toOverviewDocument(item));
  const { fuzzyRankIdsHybrid } = await import("./search-client");
  const rankedIds = await fuzzyRankIdsHybrid(documents, query);
  return fuzzyFilterByIds(structurallyFiltered, rankedIds);
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
  const normalized = query.trim();
  if (!normalized) return requests;

  const documents = requests.map((item) => toSavedRequestDocument(item));
  return fuzzyFilterByIds(requests, fuzzyRankIds(documents, normalized));
}

export function filterHistoryEntries(entries: HistoryEntry[], query: string): HistoryEntry[] {
  const normalized = query.trim();
  if (!normalized) return entries;

  const documents = entries.map((entry) => toHistoryDocument(entry));
  return fuzzyFilterByIds(entries, fuzzyRankIds(documents, normalized));
}

export async function filterSavedRequestsAsync(
  requests: SavedRequest[],
  query: string,
): Promise<SavedRequest[]> {
  const normalized = query.trim();
  if (!normalized) return requests;

  const documents = requests.map((item) => toSavedRequestDocument(item));
  const { fuzzyRankIdsHybrid } = await import("./search-client");
  const rankedIds = await fuzzyRankIdsHybrid(documents, normalized);
  return fuzzyFilterByIds(requests, rankedIds);
}

export async function filterHistoryEntriesAsync(
  entries: HistoryEntry[],
  query: string,
): Promise<HistoryEntry[]> {
  const normalized = query.trim();
  if (!normalized) return entries;

  const documents = entries.map((entry) => toHistoryDocument(entry));
  const { fuzzyRankIdsHybrid } = await import("./search-client");
  const rankedIds = await fuzzyRankIdsHybrid(documents, normalized);
  return fuzzyFilterByIds(entries, rankedIds);
}

export const OVERVIEW_METHODS = HTTP_METHODS;

export const OVERVIEW_STATUS_OPTIONS: Array<{ value: OverviewStatusFilter; label: string; hint: string }> = [
  { value: "2xx", label: "2xx", hint: "Success" },
  { value: "3xx", label: "3xx", hint: "Redirect" },
  { value: "4xx", label: "4xx", hint: "Client error" },
  { value: "5xx", label: "5xx", hint: "Server error" },
  { value: "none", label: "—", hint: "No response" },
];

export const OVERVIEW_SOURCE_OPTIONS: Array<{ value: "history" | "collections"; label: string }> = [
  { value: "history", label: "History" },
  { value: "collections", label: "Collections" },
];

export type { SearchDocument };
