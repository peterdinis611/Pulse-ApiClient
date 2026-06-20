import { useEffect, useState } from "react";
import { loadThemeMode, resolveTheme } from "@/lib/theme";

export function useStandaloneTheme(): "light" | "dark" {
  const [theme, setTheme] = useState<"light" | "dark">(() => resolveTheme(loadThemeMode()));

  useEffect(() => {
    const refresh = () => setTheme(resolveTheme(loadThemeMode()));
    refresh();

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", refresh);

    const observer = new MutationObserver(refresh);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });

    return () => {
      media.removeEventListener("change", refresh);
      observer.disconnect();
    };
  }, []);

  return theme;
}
