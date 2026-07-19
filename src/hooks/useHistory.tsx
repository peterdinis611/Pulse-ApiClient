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
import { filterHistoryEntries } from "@/lib/filters";
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
  /** True while remote/history DB search is in flight for the current query. */
  searching: boolean;
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

const REMOTE_SEARCH_DEBOUNCE_MS = 220;

export function HistoryProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<HistoryEntry[] | null>(null);
  const [searching, setSearching] = useState(false);
  const searchRequestId = useRef(0);
  const entriesRef = useRef(entries);
  entriesRef.current = entries;

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
    setSearching(false);
    const windowId = await getCurrentWindowLabel().catch(() => undefined);
    await emitHistoryUpdated(windowId);
  }, []);

  const recordEntry = useCallback(
    async (entry: HistoryEntry) => {
      if (!canUseTauriIpc()) return;

      await appendHistoryEntry(entry);
      setEntries((current) =>
        [entry, ...current.filter((item) => item.id !== entry.id)].slice(0, HISTORY_PAGE_SIZE),
      );
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

  // Instant fuse.js over loaded pages + debounced remote search for full DB.
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      searchRequestId.current += 1;
      setSearchResults(null);
      setSearching(false);
      return;
    }

    const local = filterHistoryEntries(entriesRef.current, trimmed);
    setSearchResults(local);

    if (!canUseTauriIpc()) {
      setSearching(false);
      return;
    }

    const requestId = searchRequestId.current + 1;
    searchRequestId.current = requestId;
    setSearching(true);

    const timeout = window.setTimeout(() => {
      void searchHistoryEntries(trimmed)
        .then((results) => {
          if (searchRequestId.current !== requestId) return;
          setSearchResults(results.length > 0 ? results : local);
        })
        .catch(() => {
          if (searchRequestId.current !== requestId) return;
          setSearchResults(local);
        })
        .finally(() => {
          if (searchRequestId.current === requestId) {
            setSearching(false);
          }
        });
    }, REMOTE_SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [searchQuery]); // entries intentionally omitted — local fuse uses current page via visibleEntries fallback

  const visibleEntries = useMemo(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) return entries;
    if (searchResults !== null) return searchResults;
    return filterHistoryEntries(entries, trimmed);
  }, [entries, searchQuery, searchResults]);

  const value = useMemo(
    () => ({
      entries,
      totalCount,
      hasMore,
      loading,
      loadingMore,
      searching,
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
      searching,
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
