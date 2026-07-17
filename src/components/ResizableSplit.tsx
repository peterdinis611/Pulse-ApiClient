import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ResizeHandle } from "@/components/ResizeHandle";
import {
  clampWorkspaceSplitRatio,
  WORKSPACE_SPLIT_RATIO_MAX,
  WORKSPACE_SPLIT_RATIO_MIN,
} from "@/lib/layout-preferences";

type ResizableSplitProps = {
  top: ReactNode;
  bottom: ReactNode;
  initialRatio?: number;
  onRatioChange?: (ratio: number) => void;
};

export function ResizableSplit({
  top,
  bottom,
  initialRatio = 52,
  onRatioChange,
}: ResizableSplitProps) {
  const [ratio, setRatio] = useState(() => clampWorkspaceSplitRatio(initialRatio));
  const dragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const onMouseMove = useCallback((event: MouseEvent) => {
    if (!dragging.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const next = ((event.clientY - rect.top) / rect.height) * 100;
    setRatio(clampWorkspaceSplitRatio(next));
  }, []);

  const onMouseUp = useCallback(() => {
    dragging.current = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    setRatio((current) => {
      onRatioChange?.(current);
      return current;
    });
  }, [onRatioChange]);

  useEffect(() => {
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  return (
    <div ref={containerRef} className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 overflow-hidden" style={{ flexBasis: `${ratio}%` }}>
        {top}
      </div>
      <ResizeHandle
        orientation="horizontal"
        aria-valuenow={ratio}
        aria-valuemin={WORKSPACE_SPLIT_RATIO_MIN}
        aria-valuemax={WORKSPACE_SPLIT_RATIO_MAX}
        title="Drag to resize request / response"
        onMouseDown={() => {
          dragging.current = true;
          document.body.style.cursor = "row-resize";
          document.body.style.userSelect = "none";
        }}
      />
      <div className="min-h-0 flex-1 overflow-hidden">{bottom}</div>
    </div>
  );
}
