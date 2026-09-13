import { hydrateLocale, getLocale } from "@/lib/i18n";
import { loadAndApplyCustomLanguage, saveLocaleToBackend } from "@/lib/custom-language";
import { getAppSettings } from "@/lib/http-client";
import { canUseTauriIpc } from "@/lib/tauri-runtime";
import { useEffect } from "react";

export function LocaleSync() {
  useEffect(() => {
    void (async () => {
      try {
        if (canUseTauriIpc()) {
          const settings = await getAppSettings();
          if (settings.locale) hydrateLocale(settings.locale);
        }
        await loadAndApplyCustomLanguage();
      } catch (error) {
        console.warn("Failed to hydrate locale:", error);
      }
    })();
  }, []);

  useEffect(() => {
    const onLanguageChange = () => {
      if (getLocale() !== "system") return;
      hydrateLocale("system");
      void saveLocaleToBackend("system");
    };
    window.addEventListener("languagechange", onLanguageChange);
    return () => window.removeEventListener("languagechange", onLanguageChange);
  }, []);

  return null;
}
