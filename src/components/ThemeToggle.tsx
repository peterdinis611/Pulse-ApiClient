import { useState } from "react";
import { Settings2 } from "lucide-react";
import { useApp } from "@/machines";
import { getThemeIcon } from "@/lib/theme";
import { ThemePicker } from "@/components/ThemePicker";
import { TooltipWrap } from "@/components/TooltipIconButton";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ThemeToggle() {
  const { theme, setTheme, setMainView } = useApp();
  const [open, setOpen] = useState(false);
  const Icon = getThemeIcon(theme);

  const handleThemeChange = (mode: typeof theme) => {
    setTheme(mode);
    setOpen(false);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <TooltipWrap label="Theme">
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Theme"
          >
            <Icon className="size-4" />
          </Button>
        </DropdownMenuTrigger>
      </TooltipWrap>
      <DropdownMenuContent align="end" className="w-auto p-0">
        <ThemePicker value={theme} onChange={handleThemeChange} variant="menu" />
        <div className="border-t border-border/70 p-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-full justify-start gap-2 text-xs text-muted-foreground"
            onClick={() => {
              setOpen(false);
              setMainView("settings");
            }}
          >
            <Settings2 className="size-3.5" />
            Custom CSS & appearance
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
