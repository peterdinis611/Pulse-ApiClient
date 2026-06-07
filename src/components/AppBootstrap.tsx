import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { loadUserSession } from "@/lib/auth";
import { loadPersistedState } from "@/lib/storage";
import { AppMachineContext } from "@/machines/AppProvider";

export function AppBootstrap({ children }: { children: React.ReactNode }) {
  const actorRef = AppMachineContext.useActorRef();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const [persisted, user] = await Promise.all([loadPersistedState(), loadUserSession()]);
        if (cancelled) return;
        actorRef.send({ type: "HYDRATE_APP", persisted, user });
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
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
