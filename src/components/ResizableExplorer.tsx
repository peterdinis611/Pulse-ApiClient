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

export function ResizableExplorer({ children }: ResizableExplorerProps) {
  const { explorerWidth, setExplorerWidth, explorerCollapsed } = useApp();
  const open = !explorerCollapsed;
  const [isDragging, setIsDragging] = useState(false);
  const [maxWidth, setMaxWidth] = useState(() => getExplorerWidthMax());
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(explorerWidth);
  const widthRef = useRef(explorerWidth);
  widthRef.current = explorerWidth;

  useEffect(() => {
    const updateMax = () => {
      const nextMax = getExplorerWidthMax();
      setMaxWidth(nextMax);
      if (widthRef.current > nextMax) {
        setExplorerWidth(nextMax);
      }
    };
    updateMax();
    window.addEventListener("resize", updateMax);
    return () => window.removeEventListener("resize", updateMax);
  }, [setExplorerWidth]);

  const onPointerMove = useCallback(
    (event: PointerEvent) => {
      if (!dragging.current) return;
      const delta = event.clientX - startX.current;
      setExplorerWidth(clampExplorerWidth(startWidth.current + delta));
    },
    [setExplorerWidth],
  );

  const endDrag = useCallback(() => {
    dragging.current = false;
    setIsDragging(false);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", endDrag);
    window.removeEventListener("pointercancel", endDrag);
  }, [onPointerMove]);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!open) return;
      event.preventDefault();
      dragging.current = true;
      setIsDragging(true);
      startX.current = event.clientX;
      startWidth.current = explorerWidth;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      event.currentTarget.setPointerCapture(event.pointerId);
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", endDrag);
      window.addEventListener("pointercancel", endDrag);
    },
    [endDrag, explorerWidth, onPointerMove, open],
  );

  const onDoubleClick = useCallback(() => {
    if (!open) return;
    const mid = Math.round((EXPLORER_WIDTH_MIN + maxWidth) / 2);
    // Toggle between default-ish mid and nearly full
    const next = explorerWidth >= maxWidth - 24 ? mid : maxWidth;
    setExplorerWidth(next);
  }, [explorerWidth, maxWidth, open, setExplorerWidth]);

  useEffect(() => () => endDrag(), [endDrag]);

  return (
    <div
      aria-hidden={!open}
      className={cn(
        "explorer-shell relative shrink-0 overflow-hidden border-r border-sidebar-border bg-sidebar",
        open ? "explorer-shell--open" : "explorer-shell--closed pointer-events-none",
        isDragging && "explorer-shell--dragging",
      )}
      style={{ width: open ? explorerWidth : 0 }}
    >
      <div
        className="explorer-shell__inner flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
        style={{ width: explorerWidth }}
      >
        <div className="explorer-shell__content flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {children}
        </div>
        <div
          role="separator"
          aria-orientation="vertical"
          aria-valuenow={explorerWidth}
          aria-valuemin={EXPLORER_WIDTH_MIN}
          aria-valuemax={maxWidth}
          aria-label="Resize explorer"
          title="Drag to resize · double-click to expand / restore"
          className={cn(
            "absolute -right-1.5 top-0 z-20 flex h-full w-3 cursor-col-resize touch-none items-center justify-center",
            !open && "pointer-events-none opacity-0",
          )}
          onPointerDown={onPointerDown}
          onDoubleClick={onDoubleClick}
        >
          <span className="h-12 w-0.5 rounded-full bg-border/80 transition-colors hover:bg-primary/70" />
        </div>
      </div>
    </div>
  );
}
