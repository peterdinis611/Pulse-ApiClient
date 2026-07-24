import type { LucideIcon } from "lucide-react";
import {
  Aperture,
  BookOpen,
  CloudSun,
  Coffee,
  Coins,
  Droplets,
  Eclipse,
  Flame,
  Flower2,
  Gem,
  Ghost,
  Heart,
  Hexagon,
  Layers,
  Leaf,
  Moon,
  MoonStar,
  Monitor,
  MountainSnow,
  Palette,
  Shell,
  Snowflake,
  Sparkles,
  Sprout,
  Star,
  Sun,
  SunMedium,
  Sunset,
  TreePine,
  Trees,
  Waves,
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
  "nord",
  "paper",
  "sky",
  "blossom",
  "violet",
  "coral",
  "honey",
  "midnight",
  "graphite",
  "amethyst",
  "obsidian",
  "ember",
  "slate",
  "aurora",
  "polar",
  "dracula",
  "coffee",
  "neon",
  "moss",
  "crimson",
  "copper",
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
    description: "Clean teal workspace",
    group: "classic",
    appearance: "light",
    icon: Sun,
    preview: { background: "#fafafa", primary: "#0891b2", accent: "#ecfeff" },
  },
  {
    id: "dark",
    label: "Dark",
    description: "Deep neutral with soft cyan",
    group: "classic",
    appearance: "dark",
    icon: Moon,
    preview: { background: "#141418", primary: "#22d3ee", accent: "#1a2228" },
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
    label: "Mint",
    description: "Soft mint and spring green",
    group: "color",
    appearance: "light",
    icon: Leaf,
    preview: { background: "#f4fdf8", primary: "#059669", accent: "#d1fae5" },
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
    id: "nord",
    label: "Nord",
    description: "Cool arctic gray and frost blue",
    group: "color",
    appearance: "light",
    icon: Snowflake,
    preview: { background: "#eceff4", primary: "#5e81ac", accent: "#d8dee9" },
  },
  {
    id: "paper",
    label: "Paper",
    description: "Warm cream with ink accents",
    group: "color",
    appearance: "light",
    icon: BookOpen,
    preview: { background: "#faf9f6", primary: "#57534e", accent: "#f5f5f4" },
  },
  {
    id: "sky",
    label: "Sky",
    description: "Bright airy blue workspace",
    group: "color",
    appearance: "light",
    icon: CloudSun,
    preview: { background: "#f8fbff", primary: "#0284c7", accent: "#e0f2fe" },
  },
  {
    id: "blossom",
    label: "Blossom",
    description: "Soft peach and cherry blossom",
    group: "color",
    appearance: "light",
    icon: Heart,
    preview: { background: "#fff9f8", primary: "#db2777", accent: "#fce7f3" },
  },
  {
    id: "violet",
    label: "Violet",
    description: "Soft lilac with violet accent",
    group: "color",
    appearance: "light",
    icon: Gem,
    preview: { background: "#faf8ff", primary: "#7c3aed", accent: "#ede9fe" },
  },
  {
    id: "coral",
    label: "Coral",
    description: "Warm coral and soft sand",
    group: "color",
    appearance: "light",
    icon: Shell,
    preview: { background: "#fff8f6", primary: "#ea580c", accent: "#ffedd5" },
  },
  {
    id: "honey",
    label: "Honey",
    description: "Golden honey and warm cream",
    group: "color",
    appearance: "light",
    icon: Hexagon,
    preview: { background: "#fffcf5", primary: "#d97706", accent: "#fef3c7" },
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
    label: "Abyss",
    description: "Deep teal with cyan glow",
    group: "color",
    appearance: "dark",
    icon: Waves,
    preview: { background: "#0c1518", primary: "#2dd4bf", accent: "#134e4a" },
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
  {
    id: "polar",
    label: "Polar",
    description: "Nordic polar night with frost",
    group: "color",
    appearance: "dark",
    icon: MountainSnow,
    preview: { background: "#2e3440", primary: "#88c0d0", accent: "#3b4252" },
  },
  {
    id: "dracula",
    label: "Dracula",
    description: "Classic slate developer theme",
    group: "color",
    appearance: "dark",
    icon: Ghost,
    preview: { background: "#282a36", primary: "#56cfe1", accent: "#44475a" },
  },
  {
    id: "coffee",
    label: "Coffee",
    description: "Warm espresso and caramel",
    group: "color",
    appearance: "dark",
    icon: Coffee,
    preview: { background: "#1c1410", primary: "#d4a574", accent: "#2d2118" },
  },
  {
    id: "neon",
    label: "Neon",
    description: "Cyber dark with vivid accents",
    group: "color",
    appearance: "dark",
    icon: Aperture,
    preview: { background: "#0a0a12", primary: "#22d3ee", accent: "#0f1a24" },
  },
  {
    id: "moss",
    label: "Moss",
    description: "Deep forest night with sage",
    group: "color",
    appearance: "dark",
    icon: TreePine,
    preview: { background: "#0f1612", primary: "#4ade80", accent: "#14532d" },
  },
  {
    id: "crimson",
    label: "Crimson",
    description: "Dark charcoal with crimson glow",
    group: "color",
    appearance: "dark",
    icon: Droplets,
    preview: { background: "#140e10", primary: "#fb7185", accent: "#4c0519" },
  },
  {
    id: "copper",
    label: "Copper",
    description: "Warm bronze and copper accents",
    group: "color",
    appearance: "dark",
    icon: Coins,
    preview: { background: "#17120e", primary: "#eab308", accent: "#422006" },
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
