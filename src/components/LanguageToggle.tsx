import { Languages } from "lucide-react";
import { useI18n } from "@/hooks/useLocale";
import { TooltipWrap } from "@/components/TooltipIconButton";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { LocalePreference } from "@/lib/i18n";

const OPTIONS: LocalePreference[] = ["system", "en", "sk"];

export function LanguageToggle() {
  const { t, locale, setLocale } = useI18n();

  return (
    <DropdownMenu>
      <TooltipWrap label={t("chrome.language")}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={t("chrome.language")}
          >
            <Languages className="size-4" />
          </Button>
        </DropdownMenuTrigger>
      </TooltipWrap>
      <DropdownMenuContent align="end" className="min-w-[11rem]">
        {OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option}
            onClick={() => setLocale(option)}
            className={cn(locale === option && "bg-accent font-medium")}
          >
            {option === "system"
              ? t("settings.language.system")
              : option === "en"
                ? t("settings.language.en")
                : t("settings.language.sk")}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
