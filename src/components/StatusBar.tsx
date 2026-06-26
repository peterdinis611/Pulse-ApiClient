import { useEffect, useState } from "react";
import {
  CheckCircle2,
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
    <footer className="flex h-7 items-center justify-between border-t border-border bg-background px-3 text-[11px] text-muted-foreground">
      <div className="flex min-w-0 items-center gap-3">
        <span className="inline-flex items-center gap-1.5">
          <CheckCircle2 className="size-3 text-success" />
          Online
        </span>
        {pendingRequestCount > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <LoaderCircle className="size-3.5 animate-spin" />
            {pendingRequestCount} active
            {engineStats ? ` / ${engineStats.maxConcurrent} max` : ""}
          </span>
        )}
        {engineStats && pendingRequestCount === 0 && (
          <span className="hidden sm:inline">
            Engine {engineStats.totalCompleted} ok · {engineStats.totalFailed} failed
          </span>
        )}
        {mainView === "request" && activeEnvironment && (
          <button
            type="button"
            className={cn(
              "inline-flex max-w-[180px] items-center gap-1.5 truncate rounded-md px-1.5 py-0.5 transition-colors hover:bg-accent hover:text-accent-foreground",
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
          className={cn("h-7 gap-1.5 px-2", consoleOpen && "bg-accent text-accent-foreground")}
          onClick={() => setConsoleOpen(!consoleOpen)}
        >
          <TerminalSquare className="size-3.5" />
          Console
        </Button>
      </div>

      <div className="flex items-center gap-1">
        <WindowMenu compact />
        <TooltipIconButton
          variant="ghost"
          size="icon"
          className="size-7"
          label="Clear HTTP cache"
          onClick={() =>
            void clearHttpCache()
              .then((cleared) => toast.success("Cache cleared", `${cleared} entries removed`))
              .catch(() => toast.error("Failed to clear cache"))
          }
        >
          <Trash2 className="size-3.5" />
        </TooltipIconButton>
        <TooltipIconButton
          variant="ghost"
          size="icon"
          className={cn("size-7", responsePanelOpen && "bg-accent text-accent-foreground")}
          label={responsePanelOpen ? "Hide response panel" : "Show response panel"}
          onClick={() => setResponsePanelOpen(!responsePanelOpen)}
        >
          <LayoutPanelTop className="size-3.5" />
        </TooltipIconButton>
      </div>
    </footer>
  );
}
