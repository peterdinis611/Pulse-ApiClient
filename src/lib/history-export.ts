import type { HistoryEntry } from "@/types";
import { HISTORY_PAGE_SIZE, listHistoryPage } from "./history-client";

/** Cap full HAR dumps so a huge SQLite history cannot freeze the UI. */
export const HISTORY_HAR_MAX = 5_000;

export async function listAllHistoryEntries(
  max = HISTORY_HAR_MAX,
): Promise<HistoryEntry[]> {
  const pageSize = Math.min(HISTORY_PAGE_SIZE, 200);
  const items: HistoryEntry[] = [];
  let offset = 0;
  while (items.length < max) {
    const page = await listHistoryPage(offset, pageSize);
    if (page.items.length === 0) break;
    items.push(...page.items);
    offset += page.items.length;
    if (!page.hasMore) break;
  }
  return items.slice(0, max);
}
