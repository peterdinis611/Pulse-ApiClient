import { ChevronDown, Plus, Search, Settings, Zap } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { UserAuthAvatar } from "@/components/UserAuthAvatar";
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

export function TopBar() {
  const { newRequestTab, setMainView } = useApp();

  return (
    <header className="flex h-12 items-center justify-between border-b border-topbar-border bg-topbar px-4 text-topbar-foreground">
      <div className="flex items-center gap-3">
        <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Zap className="size-4" />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="h-8 gap-1 px-2 text-topbar-foreground hover:bg-topbar-border hover:text-topbar-foreground"
            >
              {APP_NAME} Workspace
              <ChevronDown className="size-4 text-topbar-muted" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
            <DropdownMenuItem>{APP_NAME} Workspace</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Create workspace</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 text-topbar-muted hover:bg-topbar-border hover:text-topbar-foreground"
          title="New request"
          onClick={newRequestTab}
        >
          <Plus className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 text-topbar-muted hover:bg-topbar-border hover:text-topbar-foreground"
          title="Overview"
          onClick={() => setMainView("overview")}
        >
          <Search className="size-4" />
        </Button>
        <ThemeToggle />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 text-topbar-muted hover:bg-topbar-border hover:text-topbar-foreground"
          title="Settings"
          onClick={() => setMainView("settings")}
        >
          <Settings className="size-4" />
        </Button>
        <UserAuthAvatar />
      </div>
    </header>
  );
}
