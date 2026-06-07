import type { ReactNode } from "react";
import { createActorContext } from "@xstate/react";
import { appMachine } from "@/machines/appMachine";

export const AppMachineContext = createActorContext(appMachine);

export function AppProvider({ children }: { children: ReactNode }) {
  return <AppMachineContext.Provider>{children}</AppMachineContext.Provider>;
}
