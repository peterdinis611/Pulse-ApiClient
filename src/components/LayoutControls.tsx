import { PanelLeft, PanelLeftClose, PanelRight, PanelRightClose } from "lucide-react";
import { useApp } from "@/machines";
import { TooltipIconButton, TooltipWrap } from "@/components/TooltipIconButton";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export function LayoutControls() {
  const {
    sidebarPosition,
    sidebarCollapsed,
    setSidebarPosition,
    toggleSidebarCollapsed,
  } = useApp();

  const ToggleIcon =
    sidebarPosition === "left"
      ? sidebarCollapsed
        ? PanelLeft
        : PanelLeftClose
      : sidebarCollapsed
        ? PanelRight
        : PanelRightClose;

  return (
    <div className="flex items-center gap-0.5">
      <TooltipIconButton
        variant="ghost"
        size="icon"
        className="size-8 text-muted-foreground hover:text-foreground"
        label={sidebarCollapsed ? "Expand sidebar (⌘B)" : "Collapse sidebar (⌘B)"}
        onClick={toggleSidebarCollapsed}
      >
        <ToggleIcon className="size-4" />
      </TooltipIconButton>
      <DropdownMenu>
        <TooltipWrap label="Sidebar position">
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
            >
            {sidebarPosition === "left" ? (
              <PanelLeft className="size-4" />
            ) : (
              <PanelRight className="size-4" />
            )}
            Sidebar
          </Button>
          </DropdownMenuTrigger>
        </TooltipWrap>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuLabel>Sidebar position</DropdownMenuLabel>
          <DropdownMenuItem
            onClick={() => setSidebarPosition("left")}
            className={cn(sidebarPosition === "left" && "bg-accent")}
          >
            <PanelLeft className="size-4" />
            Left
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setSidebarPosition("right")}
            className={cn(sidebarPosition === "right" && "bg-accent")}
          >
            <PanelRight className="size-4" />
            Right
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={toggleSidebarCollapsed}>
            {sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
