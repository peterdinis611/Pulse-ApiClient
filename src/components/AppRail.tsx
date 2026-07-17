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
    <aside className="relative flex w-[52px] shrink-0 flex-col items-center border-r border-rail-border bg-rail py-3">
      <TooltipWrap label={APP_NAME}>
        <div className="mb-4 flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md shadow-primary/25">
          <Zap className="size-4" />
        </div>
      </TooltipWrap>

      <nav className="flex flex-col items-center gap-1.5">
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
                  "relative flex size-10 items-center justify-center rounded-xl transition-all",
                  active
                    ? "nav-rail-active rail-active-indicator"
                    : "text-rail-foreground hover:bg-accent/70 hover:text-foreground",
                )}
              >
                <Icon className="size-[18px]" />
              </button>
            </TooltipWrap>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col items-center gap-2 pb-1">
        <ThemeToggle />
        <UserAuthAvatar />
      </div>
    </aside>
  );
}
