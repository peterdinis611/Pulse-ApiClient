import { readStorageItem, writeStorageItem } from "./app-config";
import {
  getThemeAppearance,
  isThemeMode,
  resolveDataTheme,
  type ThemeMode,
} from "./themes";

export type { ThemeMode } from "./themes";
export {
  CLASSIC_THEMES,
  COLOR_THEMES,
  cycleThemeMode,
  getThemeDefinition,
  getThemeIcon,
  isThemeMode,
  THEME_DEFINITIONS,
  THEME_IDS,
} from "./themes";

const THEME_SUFFIX = "theme";

export function loadThemeMode(): ThemeMode {
  try {
    const value = readStorageItem(THEME_SUFFIX);
    if (value && isThemeMode(value)) {
      return value;
    }
  } catch {
    // ignore storage errors
  }
  return "system";
}

export function saveThemeMode(mode: ThemeMode): void {
  writeStorageItem(THEME_SUFFIX, mode);
}

export function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function resolveTheme(mode: ThemeMode): "light" | "dark" {
  return getThemeAppearance(mode, getSystemTheme());
}

export function applyTheme(mode: ThemeMode): "light" | "dark" {
  const systemTheme = getSystemTheme();
  const dataTheme = resolveDataTheme(mode, systemTheme);
  const appearance = getThemeAppearance(mode, systemTheme);

  document.documentElement.dataset.theme = dataTheme;
  document.documentElement.classList.toggle("dark", appearance === "dark");
  document.documentElement.style.colorScheme = appearance;
  return appearance;
}

export function toggleThemeMode(current: ThemeMode): ThemeMode {
  const appearance = resolveTheme(current);
  return appearance === "dark" ? "light" : "dark";
}
