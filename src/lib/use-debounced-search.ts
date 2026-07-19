import { useDebouncedValue as usePacerDebouncedValue } from "@tanstack/react-pacer";

type UseDebouncedValueOptions = {
  delayMs?: number;
};

/** Simple debounced value (trailing). Prefer `useDebouncedSearch` when you need pending state. */
export function useDebouncedValue<T>(value: T, options?: UseDebouncedValueOptions): T {
  const [debounced] = usePacerDebouncedValue(value, {
    wait: options?.delayMs ?? 180,
    trailing: true,
    leading: false,
  });

  return debounced;
}

export type DebouncedSearchState = {
  /** Live input value. */
  value: string;
  /** Debounced value used for expensive work. */
  debouncedValue: string;
  /** Trimmed live query. */
  query: string;
  /** Trimmed debounced query. */
  debouncedQuery: string;
  /** User typed something that has not settled yet. */
  isPending: boolean;
  /** Debounced query is non-empty — search mode is active. */
  isActive: boolean;
  /** Live query is non-empty (show search UI immediately). */
  hasQuery: boolean;
};

/**
 * Debounced search helper with explicit pending / active states.
 * Use live `query` for instant fuse.js results; use `debouncedQuery` for async/DB work.
 */
export function useDebouncedSearch(
  value: string,
  options?: UseDebouncedValueOptions,
): DebouncedSearchState {
  const [debouncedValue] = usePacerDebouncedValue(value, {
    wait: options?.delayMs ?? 180,
    trailing: true,
    leading: false,
  });

  const query = value.trim();
  const debouncedQuery = debouncedValue.trim();

  return {
    value,
    debouncedValue,
    query,
    debouncedQuery,
    isPending: value !== debouncedValue,
    isActive: debouncedQuery.length > 0,
    hasQuery: query.length > 0,
  };
}

export { usePacerDebouncedValue as useDebouncedValueWithDebouncer };
