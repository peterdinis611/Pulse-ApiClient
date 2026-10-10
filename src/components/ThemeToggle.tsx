import { useState } from "react";
import { Settings2 } from "lucide-react";
import { useAppSelector, useAppSend } from "@/machines";
import { getThemeIcon, type ThemeMode } from "@/lib/theme";
import { ThemePicker } from "@/components/ThemePicker";
import { TooltipWrap } from "@/components/TooltipIconButton";
import { Button } from "@/components/ui/button";
import { useT } from "@/hooks/useLocale";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ThemeToggle() {
  const theme = useAppSelector((state) => state.context.theme);
  const send = useAppSend();
  const t = useT();
  const [open, setOpen] = useState(false);
  const Icon = getThemeIcon(theme);

  const handleThemeChange = (mode: ThemeMode) => {
    send({ type: "SET_THEME", theme: mode });
    setOpen(false);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <TooltipWrap label={t("chrome.theme")}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={t("chrome.theme")}
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
              send({ type: "SET_MAIN_VIEW", view: "settings" });
            }}
          >
            <Settings2 className="size-3.5" />
            {t("chrome.appearanceMore")}
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
