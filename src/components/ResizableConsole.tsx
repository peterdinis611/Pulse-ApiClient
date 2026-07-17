import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  clampConsoleHeight,
  CONSOLE_HEIGHT_DEFAULT,
  CONSOLE_HEIGHT_MIN,
  getConsoleHeightMax,
  loadLayoutPreferences,
  saveLayoutPreferences,
} from "@/lib/layout-preferences";
import { ResizeHandle } from "@/components/ResizeHandle";

type ResizableConsoleProps = {
  children: ReactNode;
};

export function ResizableConsole({ children }: ResizableConsoleProps) {
  const [height, setHeight] = useState(
    () => loadLayoutPreferences().consoleHeight ?? CONSOLE_HEIGHT_DEFAULT,
  );
  const [maxHeight, setMaxHeight] = useState(() => getConsoleHeightMax());
  const dragging = useRef(false);
  const startY = useRef(0);
  const startHeight = useRef(height);

  useEffect(() => {
    const updateMax = () => {
      const nextMax = getConsoleHeightMax();
      setMaxHeight(nextMax);
      setHeight((current) => (current > nextMax ? nextMax : current));
    };
    updateMax();
    window.addEventListener("resize", updateMax);
    return () => window.removeEventListener("resize", updateMax);
  }, []);

  const onMouseMove = useCallback((event: MouseEvent) => {
    if (!dragging.current) return;
    const delta = startY.current - event.clientY;
    setHeight(clampConsoleHeight(startHeight.current + delta));
  }, []);

  const onMouseUp = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    setHeight((current) => {
      const prefs = loadLayoutPreferences();
      saveLayoutPreferences({ ...prefs, consoleHeight: current });
      return current;
    });
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
    <div className="flex shrink-0 flex-col" style={{ height }}>
      <ResizeHandle
        orientation="horizontal"
        aria-valuenow={height}
        aria-valuemin={CONSOLE_HEIGHT_MIN}
        aria-valuemax={maxHeight}
        title="Drag to resize console"
        onMouseDown={(event) => {
          dragging.current = true;
          startY.current = event.clientY;
          startHeight.current = height;
          document.body.style.cursor = "row-resize";
          document.body.style.userSelect = "none";
        }}
      />
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
