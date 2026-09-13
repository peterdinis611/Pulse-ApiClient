import { useCallback, useSyncExternalStore } from "react";
import {
  getI18nVersion,
  getLocale,
  getResolvedLocale,
  setLocale as setLocaleState,
  subscribeI18n,
  t,
  type LocalePreference,
  type MessageKey,
} from "@/lib/i18n";
import { saveLocaleToBackend } from "@/lib/custom-language";

export function useI18n() {
  const version = useSyncExternalStore(subscribeI18n, getI18nVersion, getI18nVersion);

  const setLocale = useCallback((next: LocalePreference) => {
    setLocaleState(next);
    void saveLocaleToBackend(next).catch((error) => {
      console.warn("Failed to persist locale:", error);
    });
  }, []);

  return {
    version,
    t,
    locale: getLocale(),
    resolvedLocale: getResolvedLocale(),
    setLocale,
  };
}

export function useT(): (key: MessageKey, vars?: Record<string, string | number>) => string {
  return useI18n().t;
}
