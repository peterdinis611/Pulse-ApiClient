import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { HistoryEntry } from "@/types";
import {
  appendHistoryEntry,
  clearHistoryStore,
  getHistoryCount,
  HISTORY_PAGE_SIZE,
  listHistoryPage,
  searchHistoryEntries,
} from "@/lib/history-client";
import { emitHistoryUpdated, listenHistoryUpdated } from "@/lib/history-sync";
import { listenWorkspaceReset } from "@/lib/workspace-sync";
import { canUseTauriIpc } from "@/lib/tauri-runtime";
import { getCurrentWindowLabel } from "@/lib/window-manager";

type HistoryContextValue = {
  entries: HistoryEntry[];
  totalCount: number;
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  searchQuery: string;
  searchResults: HistoryEntry[] | null;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
  setSearchQuery: (query: string) => void;
  clear: () => Promise<void>;
  recordEntry: (entry: HistoryEntry) => Promise<void>;
  visibleEntries: HistoryEntry[];
};

const HistoryContext = createContext<HistoryContextValue | null>(null);

export function HistoryProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<HistoryEntry[] | null>(null);
  const searchRequestId = useRef(0);

  const refresh = useCallback(async () => {
    if (!canUseTauriIpc()) {
      setEntries([]);
      setTotalCount(0);
      setHasMore(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [page, total] = await Promise.all([
        listHistoryPage(0, HISTORY_PAGE_SIZE),
        getHistoryCount(),
      ]);
      setEntries(page.items);
      setTotalCount(total);
      setHasMore(page.hasMore);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (!canUseTauriIpc() || loadingMore || !hasMore) return;

    setLoadingMore(true);
    try {
      const page = await listHistoryPage(entries.length, HISTORY_PAGE_SIZE);
      setEntries((current) => [...current, ...page.items]);
      setHasMore(page.hasMore);
      setTotalCount(page.total);
    } finally {
      setLoadingMore(false);
    }
  }, [entries.length, hasMore, loadingMore]);

  const clear = useCallback(async () => {
    if (!canUseTauriIpc()) return;

    await clearHistoryStore();
    setEntries([]);
    setTotalCount(0);
    setHasMore(false);
    setSearchResults(null);
    const windowId = await getCurrentWindowLabel().catch(() => undefined);
    await emitHistoryUpdated(windowId);
  }, []);

  const recordEntry = useCallback(
    async (entry: HistoryEntry) => {
      if (!canUseTauriIpc()) return;

      await appendHistoryEntry(entry);
      setEntries((current) => [entry, ...current.filter((item) => item.id !== entry.id)].slice(0, HISTORY_PAGE_SIZE));
      setTotalCount((current) => current + 1);
      setHasMore(totalCount + 1 > HISTORY_PAGE_SIZE);
      const windowId = await getCurrentWindowLabel().catch(() => undefined);
      await emitHistoryUpdated(windowId);
    },
    [totalCount],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!canUseTauriIpc()) return;

    let cancelled = false;
    let unlisten: (() => void) | undefined;

    void (async () => {
      unlisten = await listenHistoryUpdated(async () => {
        if (!cancelled) await refresh();
      });
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [refresh]);

  useEffect(() => {
    if (!canUseTauriIpc()) return;

    let cancelled = false;
    let unlisten: (() => void) | undefined;

    void (async () => {
      unlisten = await listenWorkspaceReset(async () => {
        if (!cancelled) await refresh();
      });
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [refresh]);

  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setSearchResults(null);
      return;
    }

    const requestId = searchRequestId.current + 1;
    searchRequestId.current = requestId;
    const timeout = window.setTimeout(() => {
      void searchHistoryEntries(trimmed).then((results) => {
        if (searchRequestId.current !== requestId) return;
        setSearchResults(results);
      });
    }, 180);

    return () => window.clearTimeout(timeout);
  }, [searchQuery]);

  const visibleEntries = useMemo(
    () => (searchQuery.trim() ? searchResults ?? [] : entries),
    [entries, searchQuery, searchResults],
  );

  const value = useMemo(
    () => ({
      entries,
      totalCount,
      hasMore,
      loading,
      loadingMore,
      searchQuery,
      searchResults,
      refresh,
      loadMore,
      setSearchQuery,
      clear,
      recordEntry,
      visibleEntries,
    }),
    [
      entries,
      totalCount,
      hasMore,
      loading,
      loadingMore,
      searchQuery,
      searchResults,
      refresh,
      loadMore,
      clear,
      recordEntry,
      visibleEntries,
    ],
  );

  return <HistoryContext.Provider value={value}>{children}</HistoryContext.Provider>;
}

export function useHistory() {
  const context = useContext(HistoryContext);
  if (!context) {
    throw new Error("useHistory must be used within HistoryProvider");
  }
  return context;
}
