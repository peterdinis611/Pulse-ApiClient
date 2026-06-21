import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useApp } from "@/machines";
import {
  EXPLORER_WIDTH_MAX,
  EXPLORER_WIDTH_MIN,
} from "@/lib/layout-preferences";
import { cn } from "@/lib/utils";

type ResizableExplorerProps = {
  children: ReactNode;
};

function clampWidth(width: number): number {
  return Math.min(EXPLORER_WIDTH_MAX, Math.max(EXPLORER_WIDTH_MIN, Math.round(width)));
}

export function ResizableExplorer({ children }: ResizableExplorerProps) {
  const { explorerWidth, setExplorerWidth, explorerCollapsed } = useApp();
  const open = !explorerCollapsed;
  const [isDragging, setIsDragging] = useState(false);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(explorerWidth);

  const onPointerMove = useCallback(
    (event: PointerEvent) => {
      if (!dragging.current) return;
      const delta = event.clientX - startX.current;
      setExplorerWidth(clampWidth(startWidth.current + delta));
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

  useEffect(() => () => endDrag(), [endDrag]);

  return (
    <div
      aria-hidden={!open}
      className={cn(
        "explorer-shell relative shrink-0 overflow-hidden border-r border-border bg-sidebar",
        open ? "explorer-shell--open" : "explorer-shell--closed pointer-events-none",
        isDragging && "explorer-shell--dragging",
      )}
      style={{ width: open ? explorerWidth : 0 }}
    >
      <div className="explorer-shell__inner flex h-full min-h-0 flex-col" style={{ width: explorerWidth }}>
        <div className="explorer-shell__content flex min-h-0 flex-1 flex-col">{children}</div>
        <div
          role="separator"
          aria-orientation="vertical"
          aria-valuenow={explorerWidth}
          aria-valuemin={EXPLORER_WIDTH_MIN}
          aria-valuemax={EXPLORER_WIDTH_MAX}
          aria-label="Resize explorer"
          className={cn(
            "absolute -right-1.5 top-0 z-20 flex h-full w-3 cursor-col-resize touch-none items-center justify-center",
            !open && "pointer-events-none opacity-0",
          )}
          onPointerDown={onPointerDown}
        >
          <span className="h-12 w-0.5 rounded-full bg-border/80 transition-colors hover:bg-primary/70" />
        </div>
      </div>
    </div>
  );
}
