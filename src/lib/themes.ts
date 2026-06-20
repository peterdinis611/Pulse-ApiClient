import type { LucideIcon } from "lucide-react";
import {
  Flower2,
  Gem,
  Moon,
  MoonStar,
  Monitor,
  Palette,
  Sparkles,
  Sun,
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
  "midnight",
  "graphite",
  "amethyst",
  "obsidian",
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
    description: "Bright default surfaces",
    group: "classic",
    appearance: "light",
    icon: Sun,
    preview: { background: "#f8fafc", primary: "#4f6ef7", accent: "#eef2ff" },
  },
  {
    id: "dark",
    label: "Dark",
    description: "Low-light default",
    group: "classic",
    appearance: "dark",
    icon: Moon,
    preview: { background: "#17181f", primary: "#7c9cff", accent: "#252836" },
  },
  {
    id: "system",
    label: "System",
    description: "Match OS appearance",
    group: "classic",
    appearance: "system",
    icon: Monitor,
    preview: { background: "#e2e8f0", primary: "#64748b", accent: "#f1f5f9" },
  },
  {
    id: "ocean",
    label: "Ocean",
    description: "Cool blues and teal accents",
    group: "color",
    appearance: "light",
    icon: Waves,
    preview: { background: "#f0f9ff", primary: "#0891b2", accent: "#cffafe" },
  },
  {
    id: "forest",
    label: "Forest",
    description: "Calm greens and earth tones",
    group: "color",
    appearance: "light",
    icon: Trees,
    preview: { background: "#f3faf4", primary: "#15803d", accent: "#dcfce7" },
  },
  {
    id: "sunset",
    label: "Sunset",
    description: "Warm amber and soft cream",
    group: "color",
    appearance: "light",
    icon: Sunset,
    preview: { background: "#fff8f1", primary: "#ea580c", accent: "#ffedd5" },
  },
  {
    id: "rose",
    label: "Rose",
    description: "Soft blush and rose highlights",
    group: "color",
    appearance: "light",
    icon: Flower2,
    preview: { background: "#fff5f7", primary: "#e11d48", accent: "#ffe4e6" },
  },
  {
    id: "midnight",
    label: "Midnight",
    description: "Deep navy with bright blue accents",
    group: "color",
    appearance: "dark",
    icon: MoonStar,
    preview: { background: "#0b1220", primary: "#60a5fa", accent: "#172554" },
  },
  {
    id: "graphite",
    label: "Graphite",
    description: "Neutral charcoal workspace",
    group: "color",
    appearance: "dark",
    icon: Palette,
    preview: { background: "#141414", primary: "#d4d4d4", accent: "#262626" },
  },
  {
    id: "amethyst",
    label: "Amethyst",
    description: "Purple dusk with violet glow",
    group: "color",
    appearance: "dark",
    icon: Gem,
    preview: { background: "#140f1f", primary: "#c084fc", accent: "#2e1065" },
  },
  {
    id: "obsidian",
    label: "Obsidian",
    description: "Extra deep black for low glare",
    group: "color",
    appearance: "dark",
    icon: Eclipse,
    preview: { background: "#07080c", primary: "#8b9cb8", accent: "#151821" },
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
