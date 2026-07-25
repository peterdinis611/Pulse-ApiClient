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
  return store;
}

type StyleEl = { id: string; textContent: string };

function installDocumentMock() {
  const styles = new Map<string, StyleEl>();
  const headChildren: StyleEl[] = [];

  const documentMock = {
    getElementById(id: string) {
      return styles.get(id) ?? null;
    },
    createElement(tag: string) {
      if (tag !== "style") throw new Error(`Unexpected element: ${tag}`);
      const el: StyleEl & { remove?: () => void } = {
        id: "",
        textContent: "",
        remove() {
          styles.delete(this.id);
          const index = headChildren.indexOf(this);
          if (index >= 0) headChildren.splice(index, 1);
        },
      };
      return el;
    },
    head: {
      appendChild(el: StyleEl & { remove?: () => void }) {
        styles.set(el.id, el);
        headChildren.push(el);
        return el;
      },
    },
  };

  Object.defineProperty(globalThis, "document", {
    value: documentMock,
    configurable: true,
  });

  return { styles, headChildren };
}

describe.sequential("custom-theme DOM helpers", () => {
  beforeEach(() => {
    installLocalStorage();
    installDocumentMock();
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

  it("applies and replaces a custom style tag", async () => {
    const { applyCustomThemeCss, CUSTOM_THEME_STYLE_ID } = await import("@/lib/custom-theme");

    applyCustomThemeCss("  :root { --primary: blue; }  ");
    expect(document.getElementById(CUSTOM_THEME_STYLE_ID)?.textContent).toBe(
      ":root { --primary: blue; }",
    );

    applyCustomThemeCss(":root { --primary: green; }");
    expect(document.getElementById(CUSTOM_THEME_STYLE_ID)?.textContent).toBe(
      ":root { --primary: green; }",
    );

    applyCustomThemeCss("   ");
    expect(document.getElementById(CUSTOM_THEME_STYLE_ID)).toBeNull();
  });

  it("persists editor css and clears browser storage", async () => {
    const {
      saveCustomThemeCssContent,
      getStoredCustomThemeCss,
      clearBrowserCustomThemeCss,
      CUSTOM_THEME_STYLE_ID,
      CUSTOM_THEME_CSS_TEMPLATE,
    } = await import("@/lib/custom-theme");

    expect(CUSTOM_THEME_CSS_TEMPLATE).toContain("Pulse custom theme overrides");
    expect(CUSTOM_THEME_CSS_TEMPLATE).toContain("--primary");

    saveCustomThemeCssContent(":root { --radius: 1rem; }");
    expect(getStoredCustomThemeCss()).toBe(":root { --radius: 1rem; }");
    expect(document.getElementById(CUSTOM_THEME_STYLE_ID)?.textContent).toBe(
      ":root { --radius: 1rem; }",
    );

    clearBrowserCustomThemeCss();
    expect(getStoredCustomThemeCss()).toBeNull();
    expect(document.getElementById(CUSTOM_THEME_STYLE_ID)).toBeNull();
  });

  it("loads stored css in the browser and supports file name path", async () => {
    const {
      saveCustomThemeCssContent,
      loadAndApplyCustomThemeCss,
      applyCustomThemeFromBrowserFile,
      getBrowserCustomThemePath,
      loadCustomThemeCssForEditor,
      clearCustomThemeCss,
      CUSTOM_THEME_STYLE_ID,
    } = await import("@/lib/custom-theme");

    saveCustomThemeCssContent(":root { --info: cyan; }");
    await expect(loadAndApplyCustomThemeCss()).resolves.toBeNull();
    expect(document.getElementById(CUSTOM_THEME_STYLE_ID)?.textContent).toBe(
      ":root { --info: cyan; }",
    );

    const file = {
      name: "my-theme.css",
      text: async () => ":root { --success: green; }",
    } as File;

    await applyCustomThemeFromBrowserFile(file);
    expect(getBrowserCustomThemePath()).toBe("my-theme.css");
    expect(await loadCustomThemeCssForEditor(null)).toBe(":root { --success: green; }");

    await clearCustomThemeCss();
    expect(getBrowserCustomThemePath()).toBeNull();
    expect(await loadCustomThemeCssForEditor(null)).toBe("");
  });

  it("rejects desktop-only path loading in the browser", async () => {
    const { applyCustomThemeFromPath } = await import("@/lib/custom-theme");
    await expect(applyCustomThemeFromPath("/tmp/theme.css")).rejects.toThrow(
      /desktop app/i,
    );
  });
});
