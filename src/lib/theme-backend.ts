import { setTheme as setNativeTheme } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { isThemeMode, resolveTheme, type ThemeMode } from "./theme";

export async function loadThemeFromBackend(): Promise<ThemeMode | null> {
  try {
    const theme = await invoke<string>("get_theme");
    return isThemeMode(theme) ? theme : null;
  } catch {
    return null;
  }
}

export async function saveThemeToBackend(mode: ThemeMode): Promise<void> {
  try {
    await invoke("set_theme", { theme: mode });
  } catch {
    // Vite dev in browser — localStorage only
  }
}

export async function syncNativeTheme(mode: ThemeMode): Promise<void> {
  try {
    if (mode === "system") {
      await setNativeTheme(null);
      return;
    }

    await setNativeTheme(resolveTheme(mode));
  } catch {
    // Vite dev in browser
  }
}
