import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type LoadingScreenProps = {
  variant?: "fullscreen" | "inline";
  label?: string;
  className?: string;
};

export function LoadingScreen({
  variant = "fullscreen",
  label = "Loading",
  className,
}: LoadingScreenProps) {
  const isFullscreen = variant === "fullscreen";

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      className={cn(
        "flex flex-col items-center justify-center gap-2 bg-background text-muted-foreground",
        isFullscreen ? "min-h-screen" : "min-h-0 flex-1 py-12",
        className,
      )}
    >
      <LoaderCircle className={cn("animate-spin", isFullscreen ? "size-6" : "size-5")} />
      <span className={cn("text-sm", isFullscreen ? "sr-only" : "text-muted-foreground")}>
        {label}
      </span>
    </div>
  );
}
