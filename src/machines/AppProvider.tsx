import type { ReactNode } from "react";
import { createActorContext } from "@xstate/react";
import { appMachine } from "@/machines/appMachine";
import { AppBootstrap } from "@/components/AppBootstrap";

export const AppMachineContext = createActorContext(appMachine);

export function AppProvider({ children }: { children: ReactNode }) {
  return (
    <AppMachineContext.Provider>
      <AppBootstrap>{children}</AppBootstrap>
    </AppMachineContext.Provider>
  );
}
