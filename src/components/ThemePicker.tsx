import type { ThemeMode } from "@/lib/theme";
import { getSystemTheme } from "@/lib/theme";
import {
  CLASSIC_THEMES,
  COLOR_THEMES,
  getThemeDefinition,
  type ThemeDefinition,
} from "@/lib/themes";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

type ThemePickerProps = {
  value: ThemeMode;
  onChange: (mode: ThemeMode) => void;
  variant?: "grid" | "menu";
};

function getThemePreviewBackground(theme: ThemeDefinition): string {
  if (theme.id === "system") {
    const light = getThemeDefinition("light").preview;
    const dark = getThemeDefinition("dark").preview;
    return `linear-gradient(90deg, ${light.background} 0%, ${light.background} 50%, ${dark.background} 50%, ${dark.background} 100%)`;
  }

  return theme.preview.background;
}

function ClassicThemeTile({
  theme,
  active,
  onSelect,
}: {
  theme: ThemeDefinition;
  active: boolean;
  onSelect: (mode: ThemeMode) => void;
}) {
  const Icon = theme.icon;

  return (
    <button
      type="button"
      title={theme.description}
      onClick={() => onSelect(theme.id)}
      className={cn(
        "group relative overflow-hidden rounded-lg border text-center transition-all",
        active
          ? "border-primary ring-2 ring-primary/35"
          : "border-border/80 hover:border-primary/35",
      )}
    >
      <div className="h-7" style={{ background: getThemePreviewBackground(theme) }}>
        {theme.id === "system" ? (
          <div className="grid h-full grid-cols-2">
            <span style={{ background: getThemeDefinition("light").preview.primary, opacity: 0.55 }} />
            <span style={{ background: getThemeDefinition("dark").preview.primary, opacity: 0.55 }} />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center gap-1 px-2">
            <span className="h-1.5 flex-1 rounded-full" style={{ background: theme.preview.primary }} />
            <span className="size-1.5 rounded-full" style={{ background: theme.preview.accent }} />
          </div>
        )}
      </div>
      <div className="flex flex-col items-center gap-1 px-2 py-2">
        <Icon className={cn("size-3.5", active ? "text-primary" : "text-muted-foreground")} />
        <span className="text-[11px] font-medium leading-none">{theme.label}</span>
      </div>
      {active && (
        <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="size-2.5" strokeWidth={3} />
        </span>
      )}
    </button>
  );
}

function ColorThemeTile({
  theme,
  active,
  onSelect,
}: {
  theme: ThemeDefinition;
  active: boolean;
  onSelect: (mode: ThemeMode) => void;
}) {
  return (
    <button
      type="button"
      title={theme.description}
      onClick={() => onSelect(theme.id)}
      className={cn(
        "group relative overflow-hidden rounded-lg border transition-all",
        active
          ? "border-primary ring-2 ring-primary/35"
          : "border-border/70 hover:border-primary/35",
      )}
    >
      <div className="h-10" style={{ background: theme.preview.background }}>
        <div className="flex h-full flex-col justify-between p-1.5">
          <span className="ml-auto h-1.5 w-5 rounded-full" style={{ background: theme.preview.primary }} />
          <span className="h-2 rounded-sm" style={{ background: theme.preview.accent }} />
        </div>
      </div>
      <p className="truncate px-1 py-1 text-center text-[10px] font-medium text-muted-foreground group-hover:text-foreground">
        {theme.label}
      </p>
      {active && (
        <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="size-2.5" strokeWidth={3} />
        </span>
      )}
    </button>
  );
}

function ThemeQuickMenu({
  value,
  onChange,
}: {
  value: ThemeMode;
  onChange: (mode: ThemeMode) => void;
}) {
  const activeTheme = getThemeDefinition(value);
  const systemAppearance = value === "system" ? getSystemTheme() : null;

  return (
    <div className="w-64 p-2">
      <p className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Quick pick
      </p>
      <div className="grid grid-cols-3 gap-1.5">
        {CLASSIC_THEMES.map((theme) => (
          <ClassicThemeTile
            key={theme.id}
            theme={theme}
            active={value === theme.id}
            onSelect={onChange}
          />
        ))}
      </div>

      <div className="my-2 h-px bg-border" />

      <p className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Color palettes
      </p>
      <div className="grid grid-cols-4 gap-1.5">
        {COLOR_THEMES.map((theme) => (
          <ColorThemeTile
            key={theme.id}
            theme={theme}
            active={value === theme.id}
            onSelect={onChange}
          />
        ))}
      </div>

      <p className="mt-2 border-t border-border/70 px-1 pt-2 text-[11px] text-muted-foreground">
        <span className="font-medium text-foreground">{activeTheme.label}</span>
        {systemAppearance ? ` · ${systemAppearance} from system` : ` · ${activeTheme.description}`}
      </p>
    </div>
  );
}

export function ThemePicker({ value, onChange, variant = "grid" }: ThemePickerProps) {
  const activeTheme = getThemeDefinition(value);
  const systemAppearance = value === "system" ? getSystemTheme() : null;

  if (variant === "menu") {
    return <ThemeQuickMenu value={value} onChange={onChange} />;
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Classic
        </p>
        <div className="grid grid-cols-3 gap-2">
          {CLASSIC_THEMES.map((theme) => (
            <ClassicThemeTile
              key={theme.id}
              theme={theme}
              active={value === theme.id}
              onSelect={onChange}
            />
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Color themes
        </p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {COLOR_THEMES.map((theme) => (
            <ColorThemeTile
              key={theme.id}
              theme={theme}
              active={value === theme.id}
              onSelect={onChange}
            />
          ))}
        </div>
      </div>
      <p className="text-[12px] text-muted-foreground">
        Active theme: <span className="font-medium text-foreground">{activeTheme.label}</span>
        {systemAppearance && (
          <>
            {" "}
            — currently <span className="font-medium text-foreground">{systemAppearance}</span> from
            your system
          </>
        )}
      </p>
    </div>
  );
}
