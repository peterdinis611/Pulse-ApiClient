import { useEffect, useState } from "react";
import {
  Globe2,
  LayoutPanelTop,
  LoaderCircle,
  TerminalSquare,
  Trash2,
} from "lucide-react";
import { useApp } from "@/machines";
import { clearHttpCache, getHttpEngineStats } from "@/lib/http-client";
import { toast } from "@/lib/toast";
import type { HttpEngineStats } from "@/types";
import { WindowMenu } from "@/components/WindowMenu";
import { TooltipIconButton } from "@/components/TooltipIconButton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function StatusBar() {
  const {
    consoleOpen,
    setConsoleOpen,
    responsePanelOpen,
    setResponsePanelOpen,
    pendingRequestCount,
    mainView,
    activeEnvironment,
    tabEnvironmentOverrideId,
    activeEnvironmentId,
    setMainView,
  } = useApp();
  const [engineStats, setEngineStats] = useState<HttpEngineStats | null>(null);
  const hasTabOverride =
    tabEnvironmentOverrideId != null && tabEnvironmentOverrideId !== activeEnvironmentId;

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      try {
        const stats = await getHttpEngineStats();
        if (!cancelled) setEngineStats(stats);
      } catch {
        if (!cancelled) setEngineStats(null);
      }
    };

    void refresh();
    const interval = window.setInterval(refresh, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [pendingRequestCount]);

  return (
    <footer className="flex h-7 shrink-0 items-center justify-between border-t border-topbar-border bg-topbar px-3 text-[11px] text-topbar-muted">
      <div className="flex min-w-0 items-center gap-2.5">
        {pendingRequestCount > 0 && (
          <span className="inline-flex items-center gap-1.5 text-topbar-foreground">
            <LoaderCircle className="size-3.5 animate-spin" />
            {pendingRequestCount} active
            {engineStats ? ` / ${engineStats.maxConcurrent} max` : ""}
          </span>
        )}
        {engineStats && pendingRequestCount === 0 && (
          <span className="hidden sm:inline">
            {engineStats.totalCompleted} ok · {engineStats.totalFailed} failed
          </span>
        )}
        {activeEnvironment && (
          <button
            type="button"
            className={cn(
              "inline-flex max-w-[200px] items-center gap-1.5 truncate rounded-md px-1.5 py-0.5 transition-colors hover:bg-topbar-foreground/8 hover:text-topbar-foreground",
              hasTabOverride && "text-primary",
            )}
            onClick={() => setMainView("environments")}
            title="Open environments"
          >
            <Globe2 className="size-3.5 shrink-0" />
            <span className="truncate">{activeEnvironment.name}</span>
            {hasTabOverride && (
              <span className="rounded bg-primary/15 px-1 text-[10px] font-medium uppercase text-primary">
                Tab
              </span>
            )}
          </button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            "h-6 gap-1.5 px-2 text-topbar-muted hover:text-topbar-foreground",
            consoleOpen && "bg-topbar-foreground/10 text-topbar-foreground",
          )}
          onClick={() => setConsoleOpen(!consoleOpen)}
        >
          <TerminalSquare className="size-3.5" />
          Console
        </Button>
      </div>

      <div className="flex items-center gap-0.5">
        <WindowMenu compact />
        <TooltipIconButton
          variant="ghost"
          size="icon"
          className="size-7 text-topbar-muted hover:text-topbar-foreground"
          label="Clear HTTP cache"
          onClick={() =>
            void clearHttpCache()
              .then((cleared) => toast.success("Cache cleared", `${cleared} entries removed`))
              .catch(() => toast.error("Failed to clear cache"))
          }
        >
          <Trash2 className="size-3.5" />
        </TooltipIconButton>
        {mainView === "request" && (
          <TooltipIconButton
            variant="ghost"
            size="icon"
            className={cn(
              "size-7 text-topbar-muted hover:text-topbar-foreground",
              responsePanelOpen && "bg-topbar-foreground/10 text-topbar-foreground",
            )}
            label={responsePanelOpen ? "Hide response panel" : "Show response panel"}
            onClick={() => setResponsePanelOpen(!responsePanelOpen)}
          >
            <LayoutPanelTop className="size-3.5" />
          </TooltipIconButton>
        )}
      </div>
    </footer>
  );
}
