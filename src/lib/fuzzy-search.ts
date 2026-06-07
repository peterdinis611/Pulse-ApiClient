import Fuse, { type IFuseOptions } from "fuse.js";

export type SearchDocument = {
  id: string;
  title: string;
  subtitle: string;
  method: string;
  meta: string;
  keywords?: string;
};

const defaultFuseOptions: IFuseOptions<SearchDocument> = {
  keys: [
    { name: "title", weight: 0.42 },
    { name: "subtitle", weight: 0.32 },
    { name: "method", weight: 0.12 },
    { name: "meta", weight: 0.1 },
    { name: "keywords", weight: 0.04 },
  ],
  threshold: 0.38,
  ignoreLocation: true,
  includeScore: true,
  minMatchCharLength: 1,
  distance: 120,
};

function normalizeQuery(query: string): string {
  return query.trim();
}

function createFuseIndex<T extends SearchDocument>(items: T[], options?: IFuseOptions<T>) {
  return new Fuse(items, { ...defaultFuseOptions, ...options });
}

export function fuzzyRankIds<T extends SearchDocument>(
  items: T[],
  query: string,
  limit?: number,
): string[] {
  const normalized = normalizeQuery(query);
  if (!normalized || items.length === 0) {
    return items.map((item) => item.id);
  }

  const fuse = createFuseIndex(items);
  const results = fuse.search(normalized);

  const ranked = results.map((result) => result.item.id);
  return limit ? ranked.slice(0, limit) : ranked;
}

export function fuzzyFilterByIds<T extends { id: string }>(items: T[], rankedIds: string[]): T[] {
  if (rankedIds.length === 0) return [];

  const byId = new Map(items.map((item) => [item.id, item]));
  const ordered: T[] = [];

  for (const id of rankedIds) {
    const item = byId.get(id);
    if (item) ordered.push(item);
  }

  return ordered;
}

export function fuzzySearchDocuments<T extends SearchDocument>(
  items: T[],
  query: string,
  limit?: number,
): T[] {
  const normalized = normalizeQuery(query);
  if (!normalized) return limit ? items.slice(0, limit) : items;
  return fuzzyFilterByIds(items, fuzzyRankIds(items, normalized, limit));
}

export function matchesFuzzyQuery(document: SearchDocument, query: string): boolean {
  const normalized = normalizeQuery(query);
  if (!normalized) return true;
  return fuzzyRankIds([document], normalized, 1).length > 0;
}

export function toSavedRequestDocument(item: {
  id: string;
  name: string;
  request: { url: string; method: string };
  folder?: string;
}): SearchDocument {
  return {
    id: item.id,
    title: item.name,
    subtitle: item.request.url,
    method: item.request.method,
    meta: item.folder ?? "Collection",
    keywords: item.folder ?? "",
  };
}

export function toHistoryDocument(entry: {
  id: string;
  request: { name: string; url: string; method: string };
  response?: { status: number; elapsedMs: number } | null;
}): SearchDocument {
  return {
    id: entry.id,
    title: entry.request.name || entry.request.url,
    subtitle: entry.request.url,
    method: entry.request.method,
    meta: entry.response
      ? `${entry.response.status} ${entry.response.elapsedMs}ms`
      : "Not sent",
    keywords: entry.response ? String(entry.response.status) : "",
  };
}

export function toOverviewDocument(item: {
  id: string;
  title: string;
  subtitle: string;
  method: string;
  meta: string;
  status?: number;
}): SearchDocument {
  return {
    id: item.id,
    title: item.title,
    subtitle: item.subtitle,
    method: item.method,
    meta: item.meta,
    keywords: item.status != null ? String(item.status) : "",
  };
}
