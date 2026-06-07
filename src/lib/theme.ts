import { readStorageItem, writeStorageItem } from "./app-config";

export type ThemeMode = "light" | "dark" | "system";

const THEME_SUFFIX = "theme";

export function loadThemeMode(): ThemeMode {
  try {
    const value = readStorageItem(THEME_SUFFIX);
    if (value === "light" || value === "dark" || value === "system") {
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
  if (mode === "system") return getSystemTheme();
  return mode;
}

export function applyTheme(mode: ThemeMode): "light" | "dark" {
  const resolved = resolveTheme(mode);
  document.documentElement.classList.toggle("dark", resolved === "dark");
  document.documentElement.style.colorScheme = resolved;
  return resolved;
}

export function toggleThemeMode(current: ThemeMode): ThemeMode {
  const resolved = resolveTheme(current);
  return resolved === "dark" ? "light" : "dark";
}
