import { useEffect, useState, type ReactNode } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LoadingScreen } from "@/components/LoadingScreen";
import { loadUserSession, type UserSession } from "@/lib/auth";
import {
  getScreenshotDemoPersisted,
  getScreenshotMainView,
  isScreenshotMode,
  SCREENSHOT_DEMO_USER,
} from "@/lib/screenshot-demo";
import { loadPersistedState } from "@/lib/storage";
import { canUseTauriIpc, waitForTauriIpc } from "@/lib/tauri-runtime";
import { listenWorkspaceReset, listenWorkspaceUpdated } from "@/lib/workspace-sync";
import { listenWsClose, listenWsError, listenWsMessage } from "@/lib/ws-client";
import { getCurrentWindowLabel, takePendingWindowInit } from "@/lib/window-manager";
import { AppMachineContext } from "@/machines/AppProvider";
import { flushWorkspaceFromContext } from "@/machines/appMachine";

export function AppBootstrap({ children }: { children: ReactNode }) {
  const actorRef = AppMachineContext.useActorRef();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        await waitForTauriIpc(1500);
        const useScreenshotDemo = isScreenshotMode() && !canUseTauriIpc();
        const screenshotMainView = useScreenshotDemo ? getScreenshotMainView() : null;

        const [persisted, user, windowContext] = await Promise.all([
          useScreenshotDemo
            ? Promise.resolve(getScreenshotDemoPersisted(screenshotMainView ?? "request"))
            : loadPersistedState(),
          useScreenshotDemo ? Promise.resolve<UserSession | null>(SCREENSHOT_DEMO_USER) : loadUserSession(),
          (async () => {
            if (!canUseTauriIpc()) {
              return { windowId: "main", pendingInit: null };
            }
            try {
              const label = await getCurrentWindowLabel();
              const pendingInit = await takePendingWindowInit(label);
              return { windowId: label, pendingInit };
            } catch {
              return { windowId: "main", pendingInit: null };
            }
          })(),
        ]);
        if (cancelled) return;
        actorRef.send({
          type: "HYDRATE_APP",
          persisted,
          user,
          windowId: windowContext.windowId,
          pendingInit: windowContext.pendingInit,
        });
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [actorRef]);

  useEffect(() => {
    if (!isTauri() || !canUseTauriIpc()) return;

    let cancelled = false;
    let unlisten: (() => void) | undefined;

    void (async () => {
      unlisten = await listenWorkspaceUpdated(async (payload) => {
        const windowId = await getCurrentWindowLabel();
        if (payload.sourceWindowId === windowId) return;
        const persisted = await loadPersistedState();
        if (cancelled) return;
        actorRef.send({ type: "SYNC_WORKSPACE", persisted });
      });
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [actorRef]);

  useEffect(() => {
    if (!isTauri() || !canUseTauriIpc()) return;

    let cancelled = false;
    let unlisten: (() => void) | undefined;

    void (async () => {
      unlisten = await listenWorkspaceReset(async (payload) => {
        const windowId = await getCurrentWindowLabel();
        if (payload.sourceWindowId === windowId || cancelled) return;
        actorRef.send({ type: "RESET_WORKSPACE" });
      });
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [actorRef]);

  useEffect(() => {
    if (!isTauri() || !canUseTauriIpc()) return;

    let cancelled = false;
    const unlisteners: Array<() => void> = [];

    void (async () => {
      unlisteners.push(
        await listenWsMessage((payload) => {
          if (cancelled) return;
          actorRef.send({ type: "WS_MESSAGE_RECEIVED", ...payload });
        }),
      );
      unlisteners.push(
        await listenWsClose((payload) => {
          if (cancelled) return;
          actorRef.send({ type: "WS_CLOSED", ...payload });
        }),
      );
      unlisteners.push(
        await listenWsError((payload) => {
          if (cancelled) return;
          actorRef.send({ type: "WS_ERROR", ...payload });
        }),
      );
    })();

    return () => {
      cancelled = true;
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, [actorRef]);

  useEffect(() => {
    if (!isTauri() || !canUseTauriIpc()) return;

    const flush = () => {
      void flushWorkspaceFromContext(actorRef.getSnapshot().context);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flush();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [actorRef]);

  useEffect(() => {
    if (!isTauri() || !canUseTauriIpc()) return;

    const currentWindow = getCurrentWindow();
    const unlistenPromise = currentWindow.onCloseRequested(async (event) => {
      event.preventDefault();
      await flushWorkspaceFromContext(actorRef.getSnapshot().context);
      await currentWindow.destroy();
    });

    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, [actorRef]);

  if (!ready) {
    return <LoadingScreen label="Starting Pulse" />;
  }

  return children;
}
