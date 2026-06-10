import { useEffect, useState } from "react";
import { AppWindow, CopyPlus, LayoutGrid, SquareStack } from "lucide-react";
import { useApp } from "@/machines";
import {
  createAppWindow,
  focusAppWindow,
  getCurrentWindowLabel,
  listAppWindows,
  openOverviewWindow,
  openRequestInNewWindow,
  type AppWindowInfo,
} from "@/lib/window-manager";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function WindowMenu() {
  const { request } = useApp();
  const [windows, setWindows] = useState<AppWindowInfo[]>([]);
  const [currentLabel, setCurrentLabel] = useState("main");

  const refresh = async () => {
    try {
      const [items, label] = await Promise.all([listAppWindows(), getCurrentWindowLabel()]);
      setWindows(items.sort((left, right) => Number(right.isMain) - Number(left.isMain)));
      setCurrentLabel(label);
    } catch {
      setWindows([]);
    }
  };

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 3000);
    return () => window.clearInterval(interval);
  }, []);

  const handleNewWindow = async () => {
    try {
      await createAppWindow();
      await refresh();
      toast.success("New window opened");
    } catch {
      toast.error("Failed to open new window");
    }
  };

  const handleOverviewWindow = async () => {
    try {
      await openOverviewWindow();
      await refresh();
      toast.success("Overview window opened");
    } catch {
      toast.error("Failed to open overview window");
    }
  };

  const handleFocus = async (label: string) => {
    try {
      await focusAppWindow(label);
    } catch {
      toast.error("Failed to focus window");
    }
  };

  return (
    <DropdownMenu onOpenChange={(open) => open && void refresh()}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-8 gap-1.5 px-2 text-topbar-foreground hover:bg-topbar-border hover:text-topbar-foreground"
          title="Windows"
        >
          <AppWindow className="size-4" />
          Windows
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel>Open windows</DropdownMenuLabel>
        {windows.length === 0 ? (
          <DropdownMenuItem disabled>No windows found</DropdownMenuItem>
        ) : (
          windows.map((item) => (
            <DropdownMenuItem
              key={item.label}
              onClick={() => void handleFocus(item.label)}
              className="flex items-center justify-between gap-3"
            >
              <span className="truncate">{item.title}</span>
              {item.label === currentLabel ? (
                <span className="shrink-0 text-xs text-muted-foreground">current</span>
              ) : null}
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void handleNewWindow()}>
          <CopyPlus className="size-4" />
          New window
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void handleOverviewWindow()}>
          <LayoutGrid className="size-4" />
          New overview window
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            void openRequestInNewWindow(request)
              .then(() => toast.success("Opened active request in new window"))
              .catch(() => toast.error("Failed to pop out request"));
          }}
        >
          <SquareStack className="size-4" />
          Pop out active request
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
