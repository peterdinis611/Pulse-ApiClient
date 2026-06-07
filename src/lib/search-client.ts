import { invoke } from "@tauri-apps/api/core";
import type { SearchDocument } from "./fuzzy-search";
import { fuzzyRankIds } from "./fuzzy-search";

export type FuzzySearchMatch = {
  id: string;
  score: number;
};

export async function fuzzySearchBackend(
  query: string,
  documents: SearchDocument[],
  limit?: number,
): Promise<FuzzySearchMatch[]> {
  return invoke<FuzzySearchMatch[]>("fuzzy_search_documents", {
    query,
    documents,
    limit: limit ?? null,
  });
}

export async function fuzzyRankIdsHybrid(
  documents: SearchDocument[],
  query: string,
  limit?: number,
): Promise<string[]> {
  const normalized = query.trim();
  if (!normalized) {
    return documents.map((document) => document.id);
  }

  try {
    const matches = await fuzzySearchBackend(normalized, documents, limit);
    if (matches.length > 0) {
      return matches.map((match) => match.id);
    }
  } catch {
    // fall back to local fuse.js search
  }

  return fuzzyRankIds(documents, normalized, limit);
}
