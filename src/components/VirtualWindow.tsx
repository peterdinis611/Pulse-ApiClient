import { useMemo, type ReactNode } from "react";

type VirtualWindowProps<T> = {
  items: T[];
  /** Max rows rendered at once (windowed from the start). */
  limit?: number;
  getKey: (item: T, index: number) => string;
  renderItem: (item: T, index: number) => ReactNode;
  empty?: ReactNode;
  moreLabel?: (hidden: number) => string;
  onShowMore?: () => void;
  expanded?: boolean;
};

/** Lightweight list windowing without a virtualizer dependency. */
export function VirtualWindow<T>({
  items,
  limit = 80,
  getKey,
  renderItem,
  empty = null,
  moreLabel = (n) => `Show ${n} more`,
  onShowMore,
  expanded = false,
}: VirtualWindowProps<T>) {
  const visible = useMemo(
    () => (expanded || items.length <= limit ? items : items.slice(0, limit)),
    [expanded, items, limit],
  );
  const hidden = items.length - visible.length;

  if (items.length === 0) return <>{empty}</>;

  return (
    <div className="space-y-px">
      {visible.map((item, index) => (
        <div key={getKey(item, index)}>{renderItem(item, index)}</div>
      ))}
      {hidden > 0 && onShowMore && (
        <button
          type="button"
          className="mt-1 w-full rounded-md px-2 py-1.5 text-left text-[11px] text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          onClick={onShowMore}
        >
          {moreLabel(hidden)}
        </button>
      )}
    </div>
  );
}
