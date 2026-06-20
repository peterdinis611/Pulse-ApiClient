import { invoke } from "@tauri-apps/api/core";
import type { HistoryEntry } from "@/types";
import { canUseTauriIpc } from "./tauri-runtime";

export const HISTORY_PAGE_SIZE = 50;
export const HISTORY_OVERVIEW_LIMIT = 100;
export const HISTORY_SEARCH_LIMIT = 100;

export type HistoryPage = {
  items: HistoryEntry[];
  total: number;
  hasMore: boolean;
};

type HistoryPagePayload = {
  items: HistoryEntry[];
  total: number;
  hasMore: boolean;
};

function mapHistoryPage(payload: HistoryPagePayload): HistoryPage {
  return {
    items: payload.items,
    total: payload.total,
    hasMore: payload.hasMore,
  };
}

export async function appendHistoryEntry(entry: HistoryEntry): Promise<void> {
  if (!canUseTauriIpc()) return;
  await invoke("db_append_history", { entry });
}

export async function importHistoryEntries(entries: HistoryEntry[]): Promise<number> {
  if (!canUseTauriIpc() || entries.length === 0) return 0;
  return invoke<number>("db_import_history", { entries });
}

export async function listHistoryPage(
  offset = 0,
  limit = HISTORY_PAGE_SIZE,
): Promise<HistoryPage> {
  if (!canUseTauriIpc()) {
    return { items: [], total: 0, hasMore: false };
  }

  const payload = await invoke<HistoryPagePayload>("db_list_history", { limit, offset });
  return mapHistoryPage(payload);
}

export async function searchHistoryEntries(
  query: string,
  limit = HISTORY_SEARCH_LIMIT,
): Promise<HistoryEntry[]> {
  if (!canUseTauriIpc()) return [];
  const trimmed = query.trim();
  if (!trimmed) return [];

  return invoke<HistoryEntry[]>("db_search_history", { query: trimmed, limit });
}

export async function getHistoryCount(): Promise<number> {
  if (!canUseTauriIpc()) return 0;
  return invoke<number>("db_history_count");
}

export async function clearHistoryStore(): Promise<void> {
  if (!canUseTauriIpc()) return;
  await invoke("db_clear_history");
}
