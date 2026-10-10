import { useEffect, useState } from "react";
import {
  AlertCircle,
  Globe2,
  LayoutPanelTop,
  LoaderCircle,
  TerminalSquare,
  Trash2,
} from "lucide-react";
import { shallowEqualAppSlice, useAppSelector, useAppSend } from "@/machines";
import { selectActiveEnvironment, selectActiveTab } from "@/machines/appMachine";
import { clearHttpCache, getHttpEngineStats } from "@/lib/http-client";
import { statusBadgeClass } from "@/lib/method-colors";
import { toast } from "@/lib/toast";
import type { HttpEngineStats } from "@/types";
import { WindowMenu } from "@/components/WindowMenu";
import { TooltipIconButton } from "@/components/TooltipIconButton";
import { cn } from "@/lib/utils";

export function StatusBar() {
  const slice = useAppSelector((state) => {
    const ctx = state.context;
    const tab = selectActiveTab(ctx);
    const activeEnvironment = selectActiveEnvironment(ctx);
    return {
      consoleOpen: ctx.consoleOpen,
      responsePanelOpen: ctx.responsePanelOpen,
      pendingRequestCount: ctx.tabs.reduce((n, item) => n + (item.loading ? 1 : 0), 0),
      mainView: ctx.mainView,
      activeEnvironmentName: activeEnvironment?.name ?? null,
      activeEnvironmentId: ctx.persisted.activeEnvironmentId,
      tabEnvironmentOverrideId: tab?.environmentId ?? null,
      response: tab?.response ?? null,
      error: tab?.error ?? null,
      loading: tab?.loading ?? false,
      testFailed: tab?.testResults?.failed ?? 0,
    };
  }, shallowEqualAppSlice);
  const send = useAppSend();
  const {
    consoleOpen,
    responsePanelOpen,
    pendingRequestCount,
    mainView,
    activeEnvironmentName,
    activeEnvironmentId,
    tabEnvironmentOverrideId,
    response,
    error,
    loading,
    testFailed,
  } = slice;
  const [engineStats, setEngineStats] = useState<HttpEngineStats | null>(null);
  const hasTabOverride =
    tabEnvironmentOverrideId != null && tabEnvironmentOverrideId !== activeEnvironmentId;

  useEffect(() => {
    let cancelled = false;
    let intervalId = 0;

    const refresh = async () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }
      try {
        const stats = await getHttpEngineStats();
        if (!cancelled) setEngineStats(stats);
      } catch {
        if (!cancelled) setEngineStats(null);
      }
    };

    const arm = () => {
      window.clearInterval(intervalId);
      const ms = pendingRequestCount > 0 ? 2_000 : 15_000;
      intervalId = window.setInterval(() => void refresh(), ms);
    };

    void refresh();
    arm();

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void refresh();
        arm();
      } else {
        window.clearInterval(intervalId);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [pendingRequestCount]);

  return (
    <footer className="view-header flex h-8 shrink-0 items-center justify-between px-3 text-[11px] text-topbar-muted">
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
        {pendingRequestCount > 0 && (
          <span className="status-chip status-chip--active">
            <LoaderCircle className="size-3 animate-spin" />
            {pendingRequestCount} active
            {engineStats ? ` / ${engineStats.maxConcurrent}` : ""}
          </span>
        )}
        {engineStats && pendingRequestCount === 0 && (
          <span className="status-chip hidden sm:inline-flex">
            {engineStats.totalCompleted} ok · {engineStats.totalFailed} failed
          </span>
        )}
        {mainView === "request" && !loading && error && (
          <button
            type="button"
            className="status-chip max-w-[min(100%,280px)] border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/15"
            onClick={() => send({ type: "SET_RESPONSE_PANEL_OPEN", open: true })}
            title={error}
          >
            <AlertCircle className="size-3 shrink-0" />
            <span className="truncate">Request failed</span>
          </button>
        )}
        {mainView === "request" && !loading && response && (
          <button
            type="button"
            className={cn(
              "status-chip max-w-[min(100%,320px)] font-mono hover:opacity-90",
              statusBadgeClass(response.status),
            )}
            onClick={() => send({ type: "SET_RESPONSE_PANEL_OPEN", open: !responsePanelOpen })}
            title="Toggle response panel"
          >
            <span className="truncate">
              {response.status}
              {response.statusText ? ` ${response.statusText}` : ""}
            </span>
            <span className="text-topbar-muted">·</span>
            <span className="shrink-0 tabular-nums">
              {response.fromCache ? "cached" : `${response.totalMs ?? response.elapsedMs} ms`}
            </span>
            {testFailed > 0 && (
              <span className="shrink-0 rounded-full bg-destructive/20 px-1.5 text-[9px] font-bold text-destructive">
                {testFailed} test{testFailed === 1 ? "" : "s"}
              </span>
            )}
          </button>
        )}
        {activeEnvironmentName && (
          <button
            type="button"
            className={cn(
              "status-chip max-w-[200px] hover:border-primary/30 hover:bg-primary/5 hover:text-topbar-foreground",
              hasTabOverride && "status-chip--active",
            )}
            onClick={() => send({ type: "SET_MAIN_VIEW", view: "environments" })}
            title="Open environments"
          >
            <Globe2 className="size-3 shrink-0" />
            <span className="truncate">{activeEnvironmentName}</span>
            {hasTabOverride && (
              <span className="rounded-full bg-primary/20 px-1.5 text-[9px] font-bold uppercase text-primary">
                Tab
              </span>
            )}
          </button>
        )}
        <button
          type="button"
          className={cn(
            "status-chip hover:text-topbar-foreground",
            consoleOpen && "status-chip--active",
          )}
          aria-pressed={consoleOpen}
          title={consoleOpen ? "Hide console" : "Show console"}
          onClick={() => send({ type: "SET_CONSOLE_OPEN", open: !consoleOpen })}
        >
          <TerminalSquare className="size-3" />
          Console
        </button>
      </div>

      <div className="flex items-center gap-0.5">
        <WindowMenu compact />
        <TooltipIconButton
          variant="ghost"
          size="icon"
          className="size-7 rounded-lg text-topbar-muted hover:text-topbar-foreground"
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
          className={cn(
            "size-7 rounded-lg text-topbar-muted hover:text-topbar-foreground",
            consoleOpen && "bg-primary/10 text-primary",
          )}
          label={consoleOpen ? "Hide console" : "Show console"}
          onClick={() => send({ type: "SET_CONSOLE_OPEN", open: !consoleOpen })}
        >
          <TerminalSquare className="size-3.5" />
        </TooltipIconButton>
        {mainView === "request" && (
          <TooltipIconButton
            variant="ghost"
            size="icon"
            className={cn(
              "size-7 rounded-lg text-topbar-muted hover:text-topbar-foreground",
              responsePanelOpen && "bg-primary/10 text-primary",
            )}
            label={responsePanelOpen ? "Hide response panel" : "Show response panel"}
            onClick={() => send({ type: "SET_RESPONSE_PANEL_OPEN", open: !responsePanelOpen })}
          >
            <LayoutPanelTop className="size-3.5" />
          </TooltipIconButton>
        )}
      </div>
    </footer>
  );
}
