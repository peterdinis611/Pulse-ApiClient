import { Monitor, Moon, Sun } from "lucide-react";
import { useApp } from "@/machines";
import type { ThemeMode } from "@/lib/theme";
import { TooltipWrap } from "@/components/TooltipIconButton";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const options: { mode: ThemeMode; label: string; icon: typeof Sun }[] = [
  { mode: "light", label: "Light", icon: Sun },
  { mode: "dark", label: "Dark", icon: Moon },
  { mode: "system", label: "System", icon: Monitor },
];

export function ThemeToggle() {
  const { theme, setTheme } = useApp();
  const Icon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;

  return (
    <DropdownMenu>
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
      <DropdownMenuContent align="end">
        {options.map(({ mode, label, icon: OptionIcon }) => (
          <DropdownMenuItem
            key={mode}
            onClick={() => setTheme(mode)}
            className={cn(theme === mode && "bg-accent text-accent-foreground")}
          >
            <OptionIcon className="size-4" />
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
