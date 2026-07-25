import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CLASSIC_THEMES,
  COLOR_THEMES,
  cycleThemeMode,
  getThemeAppearance,
  getThemeDefinition,
  getThemeIcon,
  isThemeMode,
  resolveDataTheme,
  THEME_DEFINITIONS,
  THEME_IDS,
  type ThemeMode,
} from "@/lib/themes";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const THEMES_CSS = readFileSync(join(ROOT, "src/styles/themes.css"), "utf8");
const INDEX_CSS = readFileSync(join(ROOT, "src/index.css"), "utf8");

const REQUIRED_CSS_TOKENS = [
  "--background",
  "--foreground",
  "--primary",
  "--primary-foreground",
  "--sidebar",
  "--rail",
  "--topbar",
  "--console",
  "--method-get",
  "--method-post",
  "--method-delete",
  "--workspace-gradient",
] as const;

const NEW_LIGHT_THEMES = ["violet", "coral", "honey"] as const;
const NEW_DARK_THEMES = ["moss", "crimson", "copper"] as const;

describe("themes catalog", () => {
  it("keeps THEME_IDS and THEME_DEFINITIONS in sync", () => {
    expect(THEME_DEFINITIONS.map((theme) => theme.id)).toEqual([...THEME_IDS]);
  });

  it("has unique ids and labels", () => {
    const ids = THEME_DEFINITIONS.map((theme) => theme.id);
    const labels = THEME_DEFINITIONS.map((theme) => theme.label);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("splits classic and color groups without overlap", () => {
    expect(CLASSIC_THEMES.map((theme) => theme.id)).toEqual(["light", "dark", "system"]);
    expect(COLOR_THEMES.every((theme) => theme.group === "color")).toBe(true);
    expect(CLASSIC_THEMES.length + COLOR_THEMES.length).toBe(THEME_DEFINITIONS.length);
  });

  it("requires preview swatches for every theme", () => {
    for (const theme of THEME_DEFINITIONS) {
      expect(theme.preview.background).toMatch(/^#|linear-gradient/);
      expect(theme.preview.primary).toMatch(/^#/);
      expect(theme.preview.accent).toMatch(/^#/);
      expect(getThemeIcon(theme.id)).toBe(theme.icon);
    }
  });

  it("recognizes built-in theme ids including the new palettes", () => {
    for (const id of [...NEW_LIGHT_THEMES, ...NEW_DARK_THEMES]) {
      expect(isThemeMode(id)).toBe(true);
    }
    expect(isThemeMode("ocean")).toBe(true);
    expect(isThemeMode("aurora")).toBe(true);
    expect(isThemeMode("invalid")).toBe(false);
    expect(isThemeMode("")).toBe(false);
  });
});

describe("theme appearance helpers", () => {
  it("resolves system theme to light or dark", () => {
    expect(resolveDataTheme("system", "dark")).toBe("dark");
    expect(resolveDataTheme("system", "light")).toBe("light");
    expect(resolveDataTheme("ocean", "dark")).toBe("ocean");
    expect(resolveDataTheme("moss", "light")).toBe("moss");
  });

  it("maps themes to light or dark appearance", () => {
    expect(getThemeAppearance("sunset", "dark")).toBe("light");
    expect(getThemeAppearance("amethyst", "light")).toBe("dark");
    expect(getThemeAppearance("system", "dark")).toBe("dark");
    expect(getThemeAppearance("system", "light")).toBe("light");

    for (const id of NEW_LIGHT_THEMES) {
      expect(getThemeAppearance(id, "dark")).toBe("light");
    }
    for (const id of NEW_DARK_THEMES) {
      expect(getThemeAppearance(id, "light")).toBe("dark");
    }
  });

  it("exposes labels for picker UI", () => {
    expect(getThemeDefinition("rose").label).toBe("Rose");
    expect(getThemeDefinition("violet").label).toBe("Violet");
    expect(getThemeDefinition("coral").label).toBe("Coral");
    expect(getThemeDefinition("honey").label).toBe("Honey");
    expect(getThemeDefinition("moss").label).toBe("Moss");
    expect(getThemeDefinition("crimson").label).toBe("Crimson");
    expect(getThemeDefinition("copper").label).toBe("Copper");
  });

  it("cycles through every theme id and wraps around", () => {
    let mode: ThemeMode = THEME_IDS[0];
    const seen = new Set<ThemeMode>();

    for (let i = 0; i < THEME_IDS.length; i += 1) {
      seen.add(mode);
      mode = cycleThemeMode(mode);
    }

    expect(seen.size).toBe(THEME_IDS.length);
    expect(mode).toBe(THEME_IDS[0]);
    expect(cycleThemeMode(THEME_IDS[THEME_IDS.length - 1])).toBe(THEME_IDS[0]);
  });
});

describe("theme CSS coverage", () => {
  it("ships css selectors for every non-system theme", () => {
    for (const id of THEME_IDS) {
      if (id === "system") continue;

      const selector = `data-theme="${id}"`;
      if (id === "light" || id === "dark") {
        expect(INDEX_CSS).toContain(selector);
      } else {
        expect(THEMES_CSS).toContain(selector);
      }
    }
  });

  it("defines required tokens inside each color theme block", () => {
    for (const theme of COLOR_THEMES) {
      const marker = `html[data-theme="${theme.id}"]`;
      const start = THEMES_CSS.indexOf(marker);
      expect(start).toBeGreaterThanOrEqual(0);

      const next = THEMES_CSS.indexOf("html[data-theme=", start + marker.length);
      const block = THEMES_CSS.slice(start, next === -1 ? undefined : next);

      for (const token of REQUIRED_CSS_TOKENS) {
        expect(block, `${theme.id} missing ${token}`).toContain(token);
      }
    }
  });

  it("includes the newly added light and dark palettes in themes.css", () => {
    for (const id of [...NEW_LIGHT_THEMES, ...NEW_DARK_THEMES]) {
      expect(THEMES_CSS).toContain(`html[data-theme="${id}"]`);
    }
  });
});

describe("custom theme example file", () => {
  it("documents the new theme ids for scoped overrides", () => {
    const example = readFileSync(
      join(ROOT, "examples/pulse-theme-override.example.css"),
      "utf8",
    );
    expect(example).toContain("Pulse — custom theme override example");
    for (const id of [...NEW_LIGHT_THEMES, ...NEW_DARK_THEMES]) {
      expect(example).toContain(id);
    }
  });
});
