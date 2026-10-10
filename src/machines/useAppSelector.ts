import { useCallback } from "react";
import type { EventFrom, SnapshotFrom } from "xstate";
import { AppMachineContext } from "@/machines/AppProvider";
import { appMachine } from "@/machines/appMachine";

type AppSnapshot = SnapshotFrom<typeof appMachine>;
type AppEvent = EventFrom<typeof appMachine>;

/** Narrow subscription — re-renders only when the selected value changes. */
export function useAppSelector<T>(
  selector: (snapshot: AppSnapshot) => T,
  isEqual: (a: T, b: T) => boolean = Object.is,
): T {
  return AppMachineContext.useSelector(selector, isEqual);
}

/** Stable send — does not subscribe to machine context. */
export function useAppSend() {
  const actorRef = AppMachineContext.useActorRef();
  return useCallback((event: AppEvent) => {
    actorRef.send(event);
  }, [actorRef]);
}

export function shallowEqualAppSlice<T extends Record<string, unknown>>(a: T, b: T): boolean {
  if (a === b) return true;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  for (const key of keys) {
    if (!Object.is(a[key], b[key])) return false;
  }
  return true;
}
