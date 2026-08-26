import type { HistoryEntry } from "@/types";

export type HistoryDayGroup = {
  id: string;
  label: string;
  entries: HistoryEntry[];
};

export type HistoryCluster = {
  key: string;
  entries: HistoryEntry[];
};

function startOfLocalDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Human day buckets for explorer history. */
export function historyDayLabel(iso: string, now = new Date()): string {
  const sent = new Date(iso);
  if (Number.isNaN(sent.getTime())) return "Unknown";

  const today = startOfLocalDay(now);
  const day = startOfLocalDay(sent);
  const diffDays = Math.round((today - day) / 86_400_000);

  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return "This week";
  if (diffDays < 30) return "This month";
  return "Older";
}

export function groupHistoryByDay(entries: HistoryEntry[], now = new Date()): HistoryDayGroup[] {
  const order = ["Today", "Yesterday", "This week", "This month", "Older", "Unknown"] as const;
  const buckets = new Map<string, HistoryEntry[]>();

  for (const entry of entries) {
    const label = historyDayLabel(entry.sentAt, now);
    const list = buckets.get(label);
    if (list) list.push(entry);
    else buckets.set(label, [entry]);
  }

  return order
    .filter((label) => buckets.has(label))
    .map((label) => ({
      id: label.toLowerCase().replace(/\s+/g, "-"),
      label,
      entries: buckets.get(label)!,
    }));
}

export function historyClusterKey(entry: HistoryEntry): string {
  return `${entry.request.method}\0${entry.request.url}\0${entry.request.name.trim()}`;
}

/** Collapse consecutive identical requests (same method/url/name). */
export function collapseConsecutiveHistory(entries: HistoryEntry[]): HistoryCluster[] {
  const clusters: HistoryCluster[] = [];

  for (const entry of entries) {
    const key = historyClusterKey(entry);
    const last = clusters[clusters.length - 1];
    if (last && last.key === key) {
      last.entries.push(entry);
    } else {
      clusters.push({ key, entries: [entry] });
    }
  }

  return clusters;
}

export function formatElapsedMs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 10_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 1000)}s`;
}
