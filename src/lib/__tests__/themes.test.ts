import { describe, expect, it } from "vitest";
import { getThemeAppearance, getThemeDefinition, isThemeMode, resolveDataTheme } from "@/lib/themes";

describe("themes", () => {
  it("recognizes built-in and custom theme ids", () => {
    expect(isThemeMode("ocean")).toBe(true);
    expect(isThemeMode("aurora")).toBe(true);
    expect(isThemeMode("sand")).toBe(true);
    expect(isThemeMode("violet")).toBe(true);
    expect(isThemeMode("coral")).toBe(true);
    expect(isThemeMode("honey")).toBe(true);
    expect(isThemeMode("moss")).toBe(true);
    expect(isThemeMode("crimson")).toBe(true);
    expect(isThemeMode("copper")).toBe(true);
    expect(isThemeMode("invalid")).toBe(false);
  });

  it("resolves system theme to light or dark", () => {
    expect(resolveDataTheme("system", "dark")).toBe("dark");
    expect(resolveDataTheme("ocean", "dark")).toBe("ocean");
  });

  it("maps custom themes to light or dark appearance", () => {
    expect(getThemeAppearance("sunset", "dark")).toBe("light");
    expect(getThemeAppearance("amethyst", "light")).toBe("dark");
    expect(getThemeAppearance("honey", "dark")).toBe("light");
    expect(getThemeAppearance("crimson", "light")).toBe("dark");
    expect(getThemeAppearance("system", "dark")).toBe("dark");
  });

  it("exposes labels for picker UI", () => {
    expect(getThemeDefinition("rose").label).toBe("Rose");
    expect(getThemeDefinition("violet").label).toBe("Violet");
    expect(getThemeDefinition("moss").label).toBe("Moss");
  });
});
