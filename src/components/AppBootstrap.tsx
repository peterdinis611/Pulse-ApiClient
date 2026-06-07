import { useEffect, useState, type ReactNode } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LoaderCircle } from "lucide-react";
import { loadUserSession } from "@/lib/auth";
import { loadPersistedState } from "@/lib/storage";
import { canUseTauriIpc, waitForTauriIpc } from "@/lib/tauri-runtime";
import { listenWorkspaceReset, listenWorkspaceUpdated } from "@/lib/workspace-sync";
import { getCurrentWindowLabel, takePendingWindowInit } from "@/lib/window-manager";
import { AppMachineContext } from "@/machines/AppProvider";

export function AppBootstrap({ children }: { children: ReactNode }) {
  const actorRef = AppMachineContext.useActorRef();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        await waitForTauriIpc(1500);
        const [persisted, user, windowContext] = await Promise.all([
          loadPersistedState(),
          loadUserSession(),
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

    const currentWindow = getCurrentWindow();
    const unlistenPromise = currentWindow.onCloseRequested(() => {
      actorRef.send({ type: "PERSIST_WINDOW_SESSION" });
    });

    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, [actorRef]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        <LoaderCircle className="size-6 animate-spin" />
      </div>
    );
  }

  return children;
}
