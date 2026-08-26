import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useApp } from "@/machines";
import {
  clampExplorerWidth,
  EXPLORER_WIDTH_MIN,
  getExplorerWidthMax,
} from "@/lib/layout-preferences";
import { cn } from "@/lib/utils";

type ResizableExplorerProps = {
  children: ReactNode;
};

/**
 * Explorer panel + a flex-flow resize gutter (sibling between panel and workspace).
 * Drag width is applied locally during the gesture; persisted width commits on pointer up
 * so we do not thrash xstate/localStorage on every pixel.
 */
export function ResizableExplorer({ children }: ResizableExplorerProps) {
  const { explorerWidth, setExplorerWidth, explorerCollapsed } = useApp();
  const open = !explorerCollapsed;
  const [maxWidth, setMaxWidth] = useState(() => getExplorerWidthMax());
  const [liveWidth, setLiveWidth] = useState<number | null>(null);
  const displayWidth = liveWidth ?? explorerWidth;

  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(explorerWidth);
  const liveWidthRef = useRef(displayWidth);
  liveWidthRef.current = displayWidth;

  useEffect(() => {
    const updateMax = () => {
      const nextMax = getExplorerWidthMax();
      setMaxWidth(nextMax);
      if (liveWidthRef.current > nextMax) {
        setLiveWidth(null);
        setExplorerWidth(nextMax);
      }
    };
    updateMax();
    window.addEventListener("resize", updateMax);
    return () => window.removeEventListener("resize", updateMax);
  }, [setExplorerWidth]);

  // Keep live width in sync when not dragging (e.g. restored prefs / double-click).
  useEffect(() => {
    if (!dragging.current) setLiveWidth(null);
  }, [explorerWidth]);

  const onPointerMove = useCallback((event: PointerEvent) => {
    if (!dragging.current) return;
    const next = clampExplorerWidth(startWidth.current + (event.clientX - startX.current));
    setLiveWidth(next);
  }, []);

  const endDrag = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", endDrag);
    window.removeEventListener("pointercancel", endDrag);

    const committed = liveWidthRef.current;
    setLiveWidth(null);
    setExplorerWidth(clampExplorerWidth(committed));
  }, [onPointerMove, setExplorerWidth]);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!open || event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();

      dragging.current = true;
      startX.current = event.clientX;
      startWidth.current = displayWidth;
      setLiveWidth(displayWidth);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // WebKit may reject capture in edge cases — window listeners still work.
      }

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", endDrag);
      window.addEventListener("pointercancel", endDrag);
    },
    [displayWidth, endDrag, onPointerMove, open],
  );

  const onDoubleClick = useCallback(() => {
    if (!open) return;
    const mid = Math.round((EXPLORER_WIDTH_MIN + maxWidth) / 2);
    const next = displayWidth >= maxWidth - 24 ? mid : maxWidth;
    setLiveWidth(null);
    setExplorerWidth(next);
  }, [displayWidth, maxWidth, open, setExplorerWidth]);

  useEffect(() => () => endDrag(), [endDrag]);

  const isDragging = liveWidth != null;

  return (
    <>
      <div
        aria-hidden={!open}
        className={cn(
          "explorer-shell relative shrink-0 overflow-hidden border-r border-sidebar-border bg-sidebar",
          open ? "explorer-shell--open" : "explorer-shell--closed pointer-events-none",
          isDragging && "explorer-shell--dragging",
        )}
        style={{ width: open ? displayWidth : 0 }}
      >
        <div
          className="explorer-shell__inner flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
          style={{ width: displayWidth }}
        >
          <div className="explorer-shell__content flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {children}
          </div>
        </div>
      </div>

      {open && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-valuenow={displayWidth}
          aria-valuemin={EXPLORER_WIDTH_MIN}
          aria-valuemax={maxWidth}
          aria-label="Resize explorer"
          title="Drag to resize · double-click to expand fully / restore"
          className={cn(
            "explorer-resize-gutter group relative z-40 flex h-full w-3 shrink-0 cursor-col-resize touch-none items-center justify-center",
            "hover:bg-primary/10",
            isDragging && "bg-primary/15",
          )}
          onPointerDown={onPointerDown}
          onDoubleClick={onDoubleClick}
        >
          <span
            className={cn(
              "h-10 w-0.5 rounded-full bg-border transition-all",
              "group-hover:h-14 group-hover:bg-primary",
              isDragging && "h-14 bg-primary",
            )}
          />
        </div>
      )}
    </>
  );
}
