import {
  BookOpen,
  Globe2,
  LayoutGrid,
  Send,
  Settings,
  Zap,
} from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageToggle } from "@/components/LanguageToggle";
import { UserAuthAvatar } from "@/components/UserAuthAvatar";
import { TooltipWrap } from "@/components/TooltipIconButton";
import { APP_NAME } from "@/lib/app-config";
import { useApp } from "@/machines";
import { useT } from "@/hooks/useLocale";
import { cn } from "@/lib/utils";
import type { MainView } from "@/types";
import type { MessageKey } from "@/lib/i18n";

const NAV_ITEMS: Array<{
  view: MainView;
  icon: typeof LayoutGrid;
  labelKey: MessageKey;
}> = [
  { view: "overview", icon: LayoutGrid, labelKey: "rail.overview" },
  { view: "request", icon: Send, labelKey: "rail.requests" },
  { view: "environments", icon: Globe2, labelKey: "rail.environments" },
  { view: "docs", icon: BookOpen, labelKey: "rail.docs" },
  { view: "settings", icon: Settings, labelKey: "rail.settings" },
];

export function AppRail() {
  const { mainView, setMainView, explorerCollapsed, toggleExplorerCollapsed } = useApp();
  const t = useT();

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
        {NAV_ITEMS.map(({ view, icon: Icon, labelKey }) => {
          const label = t(labelKey);
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
        <LanguageToggle />
        <ThemeToggle />
        <UserAuthAvatar />
      </div>
    </aside>
  );
}
