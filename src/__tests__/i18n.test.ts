import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyCustomLanguagePack,
  bootstrapLocale,
  clearCustomLanguagePackState,
  EN_MESSAGES,
  interpolate,
  languagePackTemplate,
  languagePackTemplateJson,
  parseLanguagePack,
  resolveLocale,
  setLocale,
  SK_MESSAGES,
  t,
} from "@/lib/i18n";
import examplePack from "../../examples/pulse-language.en.json";

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

describe("i18n", () => {
  beforeEach(() => {
    installLocalStorage();
    setLocale("en");
    clearCustomLanguagePackState();
  });

  afterEach(() => {
    clearCustomLanguagePackState();
    setLocale("en");
  });

  it("keeps Slovak keys in sync with English", () => {
    expect(Object.keys(SK_MESSAGES).sort()).toEqual(Object.keys(EN_MESSAGES).sort());
  });

  it("ships an example JSON that matches the English catalog", () => {
    expect(examplePack.meta.code).toBe("en");
    expect(examplePack.strings).toEqual(EN_MESSAGES);
    expect(JSON.parse(languagePackTemplateJson()).strings).toEqual(EN_MESSAGES);
  });

  it("falls back to English, then overlay wins", () => {
    setLocale("en");
    expect(t("rail.overview")).toBe("Overview");

    setLocale("sk");
    expect(t("rail.overview")).toBe("Prehľad");

    applyCustomLanguagePack({
      meta: { name: "Deutsch", code: "de" },
      strings: { "rail.overview": "Übersicht" },
    });
    expect(t("rail.overview")).toBe("Übersicht");
    expect(t("rail.settings")).toBe("Nastavenia");
  });

  it("parses nested and flat language packs", () => {
    const nested = parseLanguagePack(
      JSON.stringify({
        meta: { name: "Deutsch", code: "de" },
        strings: { "rail.overview": "Übersicht" },
      }),
    );
    expect(nested.meta).toEqual({ name: "Deutsch", code: "de" });
    expect(nested.strings["rail.overview"]).toBe("Übersicht");

    const flat = parseLanguagePack(JSON.stringify({ "rail.docs": "Docs" }));
    expect(flat.strings["rail.docs"]).toBe("Docs");
    expect(flat.meta.name).toBe("Custom");
  });

  it("rejects invalid language JSON", () => {
    expect(() => parseLanguagePack("[]")).toThrow(/JSON object/i);
    expect(() => parseLanguagePack("{")).toThrow(/valid JSON/i);
    expect(() => parseLanguagePack(JSON.stringify({ meta: { name: "X" } }))).toThrow(
      /no string keys/i,
    );
  });

  it("interpolates placeholders", () => {
    expect(interpolate("Loaded {count} keys from {name}", { count: 4, name: "de.json" })).toBe(
      "Loaded 4 keys from de.json",
    );
    expect(t("settings.language.loaded", { count: 2, name: "pack.json" })).toContain("2");
  });

  it("resolves system locale from the OS language", () => {
    const previous = globalThis.navigator;
    Object.defineProperty(globalThis, "navigator", {
      value: { language: "sk-SK", languages: ["sk-SK"] },
      configurable: true,
    });
    expect(resolveLocale("system")).toBe("sk");
    Object.defineProperty(globalThis, "navigator", {
      value: { language: "en-US", languages: ["en-US"] },
      configurable: true,
    });
    expect(resolveLocale("system")).toBe("en");
    if (previous) {
      Object.defineProperty(globalThis, "navigator", { value: previous, configurable: true });
    }
  });

  it("bootstraps a stored locale", () => {
    localStorage.setItem("pulse-api-client/locale", "sk");
    bootstrapLocale();
    expect(t("rail.overview")).toBe("Prehľad");
  });

  it("exports every catalog key in the template", () => {
    const template = languagePackTemplate();
    expect(Object.keys(template.strings).length).toBe(Object.keys(EN_MESSAGES).length);
  });
});
