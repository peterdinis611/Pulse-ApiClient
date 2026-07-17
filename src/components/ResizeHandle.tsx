import { cn } from "@/lib/utils";

type ResizeHandleProps = {
  orientation: "horizontal" | "vertical";
  className?: string;
  title?: string;
  onMouseDown?: (event: React.MouseEvent<HTMLDivElement>) => void;
  onPointerDown?: (event: React.PointerEvent<HTMLDivElement>) => void;
  "aria-valuenow"?: number;
  "aria-valuemin"?: number;
  "aria-valuemax"?: number;
};

export function ResizeHandle({
  orientation,
  className,
  title,
  onMouseDown,
  onPointerDown,
  "aria-valuenow": ariaValueNow,
  "aria-valuemin": ariaValueMin,
  "aria-valuemax": ariaValueMax,
}: ResizeHandleProps) {
  const horizontal = orientation === "horizontal";

  return (
    <div
      role="separator"
      aria-orientation={orientation}
      aria-valuenow={ariaValueNow}
      aria-valuemin={ariaValueMin}
      aria-valuemax={ariaValueMax}
      title={title}
      className={cn(
        "resize-handle group flex shrink-0 items-center justify-center",
        horizontal
          ? "h-2 cursor-row-resize border-y border-topbar-border bg-topbar/80"
          : "w-3 cursor-col-resize",
        className,
      )}
      onMouseDown={onMouseDown}
      onPointerDown={onPointerDown}
    >
      <span
        className={cn(
          "rounded-full bg-topbar-border transition-colors group-hover:bg-topbar-muted",
          horizontal ? "h-1 w-10" : "h-10 w-0.5",
        )}
      />
    </div>
  );
}
