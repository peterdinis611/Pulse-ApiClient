import { applyTheme } from "@/lib/theme";
import { saveThemeToBackend, syncNativeTheme } from "@/lib/theme-bootstrap";
import { useApp } from "@/machines";
import { useEffect } from "react";

export function ThemeSync() {
  const { theme } = useApp();

  useEffect(() => {
    applyTheme(theme);
    void saveThemeToBackend(theme);
    void syncNativeTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (theme !== "system") return;

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      applyTheme("system");
      void syncNativeTheme("system");
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);

  return null;
}
