import {
  Globe2,
  LayoutGrid,
  Send,
  Settings,
  Zap,
} from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { UserAuthAvatar } from "@/components/UserAuthAvatar";
import { TooltipWrap } from "@/components/TooltipIconButton";
import { APP_NAME } from "@/lib/app-config";
import { useApp } from "@/machines";
import { cn } from "@/lib/utils";
import type { MainView } from "@/types";

const NAV_ITEMS: Array<{
  view: MainView;
  icon: typeof LayoutGrid;
  label: string;
}> = [
  { view: "overview", icon: LayoutGrid, label: "Overview" },
  { view: "request", icon: Send, label: "Requests" },
  { view: "environments", icon: Globe2, label: "Environments" },
  { view: "settings", icon: Settings, label: "Settings" },
];

export function AppRail() {
  const { mainView, setMainView, explorerCollapsed, toggleExplorerCollapsed } = useApp();

  const goToRequest = () => {
    if (mainView !== "request") {
      setMainView("request");
      if (explorerCollapsed) toggleExplorerCollapsed();
      return;
    }
    setMainView("request");
  };

  return (
    <aside className="flex w-11 shrink-0 flex-col items-center border-r border-rail-border bg-rail py-2">
      <TooltipWrap label={APP_NAME}>
        <div className="mb-2 flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Zap className="size-3.5" />
        </div>
      </TooltipWrap>

      <nav className="flex flex-col items-center gap-0.5">
        {NAV_ITEMS.map(({ view, icon: Icon, label }) => {
          const active =
            view === "request" ? mainView === "request" : mainView === view;
          return (
            <TooltipWrap key={view} label={label}>
              <button
                type="button"
                aria-label={label}
                aria-current={active ? "page" : undefined}
                onClick={() => {
                  if (view === "request") {
                    goToRequest();
                    return;
                  }
                  setMainView(view);
                }}
                className={cn(
                  "relative flex size-8 items-center justify-center rounded-md transition-colors",
                  active
                    ? "bg-accent text-foreground rail-active-indicator"
                    : "text-rail-foreground hover:bg-accent/70 hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
              </button>
            </TooltipWrap>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col items-center gap-1 pb-1">
        <ThemeToggle />
        <UserAuthAvatar />
      </div>
    </aside>
  );
}
