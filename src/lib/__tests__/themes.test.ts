import { describe, expect, it } from "bun:test";
import { getThemeAppearance, getThemeDefinition, isThemeMode, resolveDataTheme } from "@/lib/themes";

describe("themes", () => {
  it("recognizes built-in and custom theme ids", () => {
    expect(isThemeMode("ocean")).toBe(true);
    expect(isThemeMode("obsidian")).toBe(true);
    expect(isThemeMode("invalid")).toBe(false);
  });

  it("resolves system theme to light or dark", () => {
    expect(resolveDataTheme("system", "dark")).toBe("dark");
    expect(resolveDataTheme("ocean", "dark")).toBe("ocean");
  });

  it("maps custom themes to light or dark appearance", () => {
    expect(getThemeAppearance("sunset", "dark")).toBe("light");
    expect(getThemeAppearance("amethyst", "light")).toBe("dark");
    expect(getThemeAppearance("system", "dark")).toBe("dark");
  });

  it("exposes labels for picker UI", () => {
    expect(getThemeDefinition("rose").label).toBe("Rose");
  });
});
