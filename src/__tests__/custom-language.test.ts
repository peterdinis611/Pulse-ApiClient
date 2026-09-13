import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function installLocalStorage() {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => store.clear(),
    },
    configurable: true,
  });
}

describe.sequential("custom language pack helpers", () => {
  beforeEach(() => {
    installLocalStorage();
    vi.resetModules();
    vi.doMock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
    vi.doMock("@/lib/tauri-runtime", () => ({
      canUseTauriIpc: () => false,
    }));
  });

  afterEach(() => {
    vi.doUnmock("@tauri-apps/plugin-dialog");
    vi.doUnmock("@/lib/tauri-runtime");
    vi.resetModules();
  });

  it("applies a browser file and clears the pack", async () => {
    const { applyCustomLanguageFromBrowserFile, clearCustomLanguage } = await import(
      "@/lib/custom-language"
    );
    const { t, getCustomLanguagePack, getBrowserCustomLanguagePath } = await import("@/lib/i18n");

    const file = {
      name: "pulse-de.json",
      text: async () =>
        JSON.stringify({
          meta: { name: "Deutsch", code: "de" },
          strings: { "rail.overview": "Übersicht" },
        }),
    } as File;

    await applyCustomLanguageFromBrowserFile(file);
    expect(getCustomLanguagePack()?.meta.name).toBe("Deutsch");
    expect(getBrowserCustomLanguagePath()).toBe("pulse-de.json");
    expect(t("rail.overview")).toBe("Übersicht");

    await clearCustomLanguage();
    expect(getCustomLanguagePack()).toBeNull();
    expect(getBrowserCustomLanguagePath()).toBeNull();
    expect(t("rail.overview")).toBe("Overview");
  });

  it("rejects desktop-only path loading in the browser", async () => {
    const { applyCustomLanguageFromPath } = await import("@/lib/custom-language");
    await expect(applyCustomLanguageFromPath("/tmp/lang.json")).rejects.toThrow(/desktop app/i);
  });

  it("applies pasted JSON without a file path", async () => {
    const { applyCustomLanguageFromText, getBrowserCustomLanguagePath } = await import(
      "@/lib/custom-language"
    );
    const { t, getCustomLanguagePack } = await import("@/lib/i18n");

    await applyCustomLanguageFromText(
      JSON.stringify({ strings: { "auth.welcome": "Willkommen" } }),
    );
    expect(t("auth.welcome")).toBe("Willkommen");
    expect(getCustomLanguagePack()?.strings["auth.welcome"]).toBe("Willkommen");
    expect(getBrowserCustomLanguagePath()).toBeNull();
  });
});
