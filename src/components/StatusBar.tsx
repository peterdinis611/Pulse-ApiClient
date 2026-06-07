import { useEffect, useState } from "react";
import { CheckCircle2, LayoutPanelTop, LoaderCircle, TerminalSquare, Trash2 } from "lucide-react";
import { useApp } from "@/machines";
import { clearHttpCache, getHttpEngineStats } from "@/lib/http-client";
import { toast } from "@/lib/toast";
import type { HttpEngineStats } from "@/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function StatusBar() {
  const {
    consoleOpen,
    setConsoleOpen,
    responsePanelOpen,
    setResponsePanelOpen,
    pendingRequestCount,
  } = useApp();
  const [engineStats, setEngineStats] = useState<HttpEngineStats | null>(null);

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
    <footer className="flex h-9 items-center justify-between border-t border-border bg-card px-3 text-xs text-muted-foreground">
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center gap-1.5">
          <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />
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
          <span>
            Engine {engineStats.totalCompleted} ok · {engineStats.totalFailed} failed
          </span>
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
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          title="Clear HTTP cache"
          onClick={() =>
            void clearHttpCache()
              .then((cleared) => toast.success("Cache cleared", `${cleared} entries removed`))
              .catch(() => toast.error("Failed to clear cache"))
          }
        >
          <Trash2 className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn("size-7", responsePanelOpen && "bg-accent text-accent-foreground")}
          onClick={() => setResponsePanelOpen(!responsePanelOpen)}
        >
          <LayoutPanelTop className="size-3.5" />
        </Button>
      </div>
    </footer>
  );
}
