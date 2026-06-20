import { loadAndApplyCustomThemeCss } from "@/lib/custom-theme";
import { useEffect } from "react";

export function CustomThemeSync() {
  useEffect(() => {
    void loadAndApplyCustomThemeCss().catch((error) => {
      console.warn("Failed to load custom theme CSS:", error);
    });
  }, []);

  return null;
}
