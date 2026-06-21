import { Check, List, X } from "lucide-react";
import type { RequestTabState } from "@/types";
import { MethodBadge } from "@/components/MethodBadge";
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

type RequestTabsMenuProps = {
  tabs: RequestTabState[];
  activeTabId: string;
  onSelect: (tabId: string) => void;
  onClose: (tabId: string) => void;
  onNewTab: () => void;
};

export function RequestTabsMenu({
  tabs,
  activeTabId,
  onSelect,
  onClose,
  onNewTab,
}: RequestTabsMenuProps) {
  if (tabs.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 shrink-0 gap-1.5 border-border/70 px-2 text-xs font-normal"
        >
          <List className="size-3.5" />
          <span>{tabs.length}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72 p-1">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Open requests
        </DropdownMenuLabel>
        <div className="max-h-64 overflow-y-auto">
          {tabs.map((tab) => {
            const active = tab.id === activeTabId;
            return (
              <DropdownMenuItem
                key={tab.id}
                className={cn(
                  "flex items-center gap-2",
                  active && "bg-accent/60",
                )}
                onClick={() => onSelect(tab.id)}
              >
                <MethodBadge method={tab.request.method} />
                <span className="min-w-0 flex-1 truncate text-[13px]">
                  {tab.request.name.trim() || "Untitled Request"}
                </span>
                {active && <Check className="size-3.5 shrink-0 text-primary" />}
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={`Close ${tab.request.name}`}
                  className="flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onClose(tab.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      event.stopPropagation();
                      onClose(tab.id);
                    }
                  }}
                >
                  <X className="size-3.5" />
                </span>
              </DropdownMenuItem>
            );
          })}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onNewTab}>New request tab</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
