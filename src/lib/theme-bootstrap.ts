import { loadThemeFromBackend, saveThemeToBackend, syncNativeTheme } from "./theme-backend";
import { applyTheme, loadThemeMode, saveThemeMode, type ThemeMode } from "./theme";

export async function bootstrapTheme(): Promise<ThemeMode> {
  const backendTheme = await loadThemeFromBackend();
  const theme = backendTheme ?? loadThemeMode();

  saveThemeMode(theme);
  applyTheme(theme);
  await syncNativeTheme(theme);

  return theme;
}

export { saveThemeToBackend, syncNativeTheme };
