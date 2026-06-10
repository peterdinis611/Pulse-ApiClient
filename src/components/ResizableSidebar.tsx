import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { useApp } from "@/machines";
import {
  SIDEBAR_WIDTH_COLLAPSED,
  SIDEBAR_WIDTH_MAX,
  SIDEBAR_WIDTH_MIN,
  type SidebarPosition,
} from "@/lib/layout-preferences";
import { cn } from "@/lib/utils";

type ResizableSidebarProps = {
  children: ReactNode;
  position: SidebarPosition;
};

export function ResizableSidebar({ children, position }: ResizableSidebarProps) {
  const { sidebarCollapsed, sidebarWidth, setSidebarWidth } = useApp();
  const dragging = useRef(false);
  const shellRef = useRef<HTMLDivElement>(null);

  const width = sidebarCollapsed ? SIDEBAR_WIDTH_COLLAPSED : sidebarWidth;
  const resizeOnLeadingEdge = position === "right";

  const onMouseMove = useCallback(
    (event: MouseEvent) => {
      if (!dragging.current || !shellRef.current || sidebarCollapsed) return;
      const rect = shellRef.current.getBoundingClientRect();
      const next =
        position === "left" ? event.clientX - rect.left : rect.right - event.clientX;
      setSidebarWidth(Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, next)));
    },
    [position, setSidebarWidth, sidebarCollapsed],
  );

  const onMouseUp = useCallback(() => {
    dragging.current = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  return (
    <div
      ref={shellRef}
      className={cn(
        "relative flex min-h-0 shrink-0 flex-col bg-sidebar",
        position === "left" ? "border-r border-sidebar-border" : "border-l border-sidebar-border",
      )}
      style={{ width }}
    >
      {!sidebarCollapsed && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          className={cn(
            "group absolute top-0 z-10 flex h-full w-2 cursor-col-resize items-center justify-center",
            resizeOnLeadingEdge ? "left-0" : "right-0",
          )}
          onMouseDown={() => {
            dragging.current = true;
            document.body.style.cursor = "col-resize";
            document.body.style.userSelect = "none";
          }}
        >
          <span className="h-10 w-1 rounded-full bg-sidebar-border transition-colors group-hover:bg-primary/60" />
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  );
}
