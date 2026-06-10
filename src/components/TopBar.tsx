import { ChevronDown, Plus, Search, Settings, Zap } from "lucide-react";
import { EnvironmentSwitcher } from "@/components/EnvironmentSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";
import { UserAuthAvatar } from "@/components/UserAuthAvatar";
import { LayoutControls } from "@/components/LayoutControls";
import { TooltipIconButton } from "@/components/TooltipIconButton";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { APP_NAME } from "@/lib/app-config";
import { useApp } from "@/machines";
import { WindowMenu } from "@/components/WindowMenu";

export function TopBar() {
  const {
    newRequestTab,
    setMainView,
    environments,
    activeEnvironmentId,
    workspaceEnvironment,
    activeEnvironment,
    setActiveEnvironmentId,
    addEnvironment,
  } = useApp();

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-border/70 bg-topbar/95 px-3 backdrop-blur-md">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
          <Zap className="size-4" />
        </div>
        <div className="hidden sm:block">
          <p className="text-sm font-semibold leading-none tracking-tight">{APP_NAME}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">API workspace</p>
        </div>

        <div className="hidden h-6 w-px bg-border md:block" />

        <EnvironmentSwitcher
          mode="workspace"
          environments={environments}
          workspaceEnvironmentId={activeEnvironmentId}
          workspaceEnvironment={workspaceEnvironment}
          requestEnvironment={activeEnvironment}
          onSetWorkspace={setActiveEnvironmentId}
          onAddEnvironment={addEnvironment}
          onManageEnvironments={() => setMainView("environments")}
          compact
          className="hidden md:flex"
        />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="hidden h-8 gap-1 px-2 text-muted-foreground lg:flex">
              Workspace
              <ChevronDown className="size-3.5 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
            <DropdownMenuItem>{APP_NAME} Workspace</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled>Create workspace</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex items-center gap-0.5">
        <div className="mr-1 flex md:hidden">
          <EnvironmentSwitcher
            mode="workspace"
            environments={environments}
            workspaceEnvironmentId={activeEnvironmentId}
            workspaceEnvironment={workspaceEnvironment}
            requestEnvironment={activeEnvironment}
            onSetWorkspace={setActiveEnvironmentId}
            onAddEnvironment={addEnvironment}
            onManageEnvironments={() => setMainView("environments")}
            compact
          />
        </div>
        <div className="mr-1 flex lg:hidden">
          <LayoutControls />
        </div>
        <WindowMenu />
        <TooltipIconButton
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground hover:text-foreground"
          label="New request"
          onClick={newRequestTab}
        >
          <Plus className="size-4" />
        </TooltipIconButton>
        <TooltipIconButton
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground hover:text-foreground"
          label="Overview"
          onClick={() => setMainView("overview")}
        >
          <Search className="size-4" />
        </TooltipIconButton>
        <ThemeToggle />
        <TooltipIconButton
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground hover:text-foreground"
          label="Settings"
          onClick={() => setMainView("settings")}
        >
          <Settings className="size-4" />
        </TooltipIconButton>
        <UserAuthAvatar />
      </div>
    </header>
  );
}
