import { useEffect, useState, type ReactNode } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LoadingScreen } from "@/components/LoadingScreen";
import { loadAppBootstrapData } from "@/lib/app-bootstrap-data";
import { loadPersistedState } from "@/lib/storage";
import { canUseTauriIpc, waitForTauriIpc } from "@/lib/tauri-runtime";
import { listenWorkspaceReset, listenWorkspaceUpdated } from "@/lib/workspace-sync";
import { listenWsClose, listenWsError, listenWsMessage } from "@/lib/ws-client";
import { getCurrentWindowLabel } from "@/lib/window-manager";
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
        const bootstrap = await loadAppBootstrapData();
        if (cancelled) return;
        actorRef.send({
          type: "HYDRATE_APP",
          persisted: bootstrap.persisted,
          user: bootstrap.user,
          windowId: bootstrap.windowId,
          pendingInit: bootstrap.pendingInit,
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
      const [messageUnlisten, closeUnlisten, errorUnlisten] = await Promise.all([
        listenWsMessage((payload) => {
          if (cancelled) return;
          actorRef.send({ type: "WS_MESSAGE_RECEIVED", ...payload });
        }),
        listenWsClose((payload) => {
          if (cancelled) return;
          actorRef.send({ type: "WS_CLOSED", ...payload });
        }),
        listenWsError((payload) => {
          if (cancelled) return;
          actorRef.send({ type: "WS_ERROR", ...payload });
        }),
      ]);

      unlisteners.push(messageUnlisten, closeUnlisten, errorUnlisten);
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
