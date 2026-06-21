import type { LucideIcon } from "lucide-react";
import {
  Flame,
  Flower2,
  Gem,
  Layers,
  Moon,
  MoonStar,
  Monitor,
  Orbit,
  Palette,
  Sparkles,
  Sprout,
  Star,
  Sun,
  SunMedium,
  Sunset,
  Trees,
  Waves,
  Eclipse,
} from "lucide-react";

export const THEME_IDS = [
  "light",
  "dark",
  "system",
  "ocean",
  "forest",
  "sunset",
  "rose",
  "sand",
  "lavender",
  "citrus",
  "midnight",
  "graphite",
  "amethyst",
  "obsidian",
  "ember",
  "slate",
  "aurora",
] as const;

export type ThemeMode = (typeof THEME_IDS)[number];

export type ThemeGroup = "classic" | "color";

export type ThemeDefinition = {
  id: ThemeMode;
  label: string;
  description: string;
  group: ThemeGroup;
  appearance: "light" | "dark" | "system";
  icon: LucideIcon;
  preview: {
    background: string;
    primary: string;
    accent: string;
  };
};

export const THEME_DEFINITIONS: ThemeDefinition[] = [
  {
    id: "light",
    label: "Light",
    description: "Clean indigo workspace",
    group: "classic",
    appearance: "light",
    icon: Sun,
    preview: { background: "#fafafa", primary: "#5e6ad2", accent: "#f0f1f8" },
  },
  {
    id: "dark",
    label: "Dark",
    description: "Deep neutral with soft indigo",
    group: "classic",
    appearance: "dark",
    icon: Moon,
    preview: { background: "#141418", primary: "#8b95f9", accent: "#22232b" },
  },
  {
    id: "system",
    label: "System",
    description: "Match OS appearance",
    group: "classic",
    appearance: "system",
    icon: Monitor,
    preview: { background: "#f4f4f5", primary: "#71717a", accent: "#e4e4e7" },
  },
  {
    id: "ocean",
    label: "Ocean",
    description: "Cool cyan and slate blues",
    group: "color",
    appearance: "light",
    icon: Waves,
    preview: { background: "#f5fafc", primary: "#0e7490", accent: "#e0f2fe" },
  },
  {
    id: "forest",
    label: "Forest",
    description: "Muted sage and pine greens",
    group: "color",
    appearance: "light",
    icon: Trees,
    preview: { background: "#f6faf7", primary: "#15803d", accent: "#dcfce7" },
  },
  {
    id: "sunset",
    label: "Sunset",
    description: "Warm amber and soft cream",
    group: "color",
    appearance: "light",
    icon: Sunset,
    preview: { background: "#fffaf5", primary: "#c2410c", accent: "#ffedd5" },
  },
  {
    id: "rose",
    label: "Rose",
    description: "Soft blush with rose accent",
    group: "color",
    appearance: "light",
    icon: Flower2,
    preview: { background: "#fff8f9", primary: "#e11d48", accent: "#ffe4e6" },
  },
  {
    id: "sand",
    label: "Sand",
    description: "Warm stone and wheat tones",
    group: "color",
    appearance: "light",
    icon: SunMedium,
    preview: { background: "#faf8f4", primary: "#92400e", accent: "#fef3c7" },
  },
  {
    id: "lavender",
    label: "Lavender",
    description: "Soft violet and lilac",
    group: "color",
    appearance: "light",
    icon: Orbit,
    preview: { background: "#f9f7ff", primary: "#7c3aed", accent: "#ede9fe" },
  },
  {
    id: "citrus",
    label: "Citrus",
    description: "Fresh lime and spring green",
    group: "color",
    appearance: "light",
    icon: Sprout,
    preview: { background: "#f7fdf0", primary: "#4d7c0f", accent: "#ecfccb" },
  },
  {
    id: "midnight",
    label: "Midnight",
    description: "Deep navy with sky blue",
    group: "color",
    appearance: "dark",
    icon: MoonStar,
    preview: { background: "#0c1222", primary: "#60a5fa", accent: "#172554" },
  },
  {
    id: "graphite",
    label: "Graphite",
    description: "Neutral charcoal workspace",
    group: "color",
    appearance: "dark",
    icon: Palette,
    preview: { background: "#161618", primary: "#a1a1aa", accent: "#27272a" },
  },
  {
    id: "amethyst",
    label: "Amethyst",
    description: "Purple dusk with violet glow",
    group: "color",
    appearance: "dark",
    icon: Gem,
    preview: { background: "#130f1c", primary: "#c084fc", accent: "#2e1065" },
  },
  {
    id: "obsidian",
    label: "Obsidian",
    description: "True black, minimal glare",
    group: "color",
    appearance: "dark",
    icon: Eclipse,
    preview: { background: "#09090b", primary: "#94a3b8", accent: "#18181b" },
  },
  {
    id: "ember",
    label: "Ember",
    description: "Warm charcoal with amber glow",
    group: "color",
    appearance: "dark",
    icon: Flame,
    preview: { background: "#1a120e", primary: "#fb923c", accent: "#431407" },
  },
  {
    id: "slate",
    label: "Slate",
    description: "Cool blue-gray surfaces",
    group: "color",
    appearance: "dark",
    icon: Layers,
    preview: { background: "#151922", primary: "#94a3b8", accent: "#1e293b" },
  },
  {
    id: "aurora",
    label: "Aurora",
    description: "Teal emerald northern glow",
    group: "color",
    appearance: "dark",
    icon: Star,
    preview: { background: "#0c1518", primary: "#2dd4bf", accent: "#134e4a" },
  },
];

const THEME_MAP = new Map(THEME_DEFINITIONS.map((theme) => [theme.id, theme]));

export const CLASSIC_THEMES = THEME_DEFINITIONS.filter((theme) => theme.group === "classic");
export const COLOR_THEMES = THEME_DEFINITIONS.filter((theme) => theme.group === "color");

export function isThemeMode(value: string): value is ThemeMode {
  return THEME_IDS.includes(value as ThemeMode);
}

export function getThemeDefinition(mode: ThemeMode): ThemeDefinition {
  return THEME_MAP.get(mode) ?? THEME_MAP.get("system")!;
}

export function getThemeIcon(mode: ThemeMode): LucideIcon {
  return getThemeDefinition(mode).icon;
}

export function resolveDataTheme(mode: ThemeMode, systemTheme: "light" | "dark"): Exclude<ThemeMode, "system"> {
  if (mode === "system") return systemTheme;
  return mode;
}

export function getThemeAppearance(mode: ThemeMode, systemTheme: "light" | "dark"): "light" | "dark" {
  const definition = getThemeDefinition(mode);
  if (definition.appearance === "system") return systemTheme;
  return definition.appearance;
}

export function cycleThemeMode(current: ThemeMode): ThemeMode {
  const index = THEME_IDS.indexOf(current);
  const next = THEME_IDS[(index + 1) % THEME_IDS.length];
  return next ?? "system";
}

export function fallbackThemeIcon(): LucideIcon {
  return Sparkles;
}
