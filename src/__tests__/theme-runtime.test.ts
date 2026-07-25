import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function installLocalStorage() {
  const store = new Map<string, string>();
  const mockStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: mockStorage,
    configurable: true,
  });
  return store;
}

function installDocumentMock() {
  const classList = {
    values: new Set<string>(),
    toggle(token: string, force?: boolean) {
      if (force === true) this.values.add(token);
      else if (force === false) this.values.delete(token);
      else if (this.values.has(token)) this.values.delete(token);
      else this.values.add(token);
      return this.values.has(token);
    },
    contains(token: string) {
      return this.values.has(token);
    },
  };

  const dataset: Record<string, string> = {};
  const style: Record<string, string> = {};

  const documentElement = {
    dataset,
    classList,
    style,
  };

  Object.defineProperty(globalThis, "document", {
    value: { documentElement },
    configurable: true,
  });

  return documentElement;
}

describe.sequential("theme runtime", () => {
  beforeEach(() => {
    installLocalStorage();
    installDocumentMock();
    Object.defineProperty(globalThis, "window", {
      value: {
        matchMedia: () => ({ matches: false }),
      },
      configurable: true,
    });
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("defaults to system when storage is empty or invalid", async () => {
    const { loadThemeMode, saveThemeMode } = await import("@/lib/theme");
    expect(loadThemeMode()).toBe("system");

    localStorage.setItem("pulse-api-client/theme", "not-a-theme");
    expect(loadThemeMode()).toBe("system");

    saveThemeMode("violet");
    expect(localStorage.getItem("pulse-api-client/theme")).toBe("violet");
    expect(loadThemeMode()).toBe("violet");
  });

  it("reads legacy storage keys for theme mode", async () => {
    localStorage.setItem("relay-api-client/theme", "coral");
    const { loadThemeMode } = await import("@/lib/theme");
    expect(loadThemeMode()).toBe("coral");
  });

  it("applies data-theme, dark class, and color-scheme", async () => {
    const { applyTheme, resolveTheme, toggleThemeMode } = await import("@/lib/theme");
    const appearance = applyTheme("moss");

    expect(appearance).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("moss");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe("dark");

    applyTheme("honey");
    expect(document.documentElement.dataset.theme).toBe("honey");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe("light");

    expect(resolveTheme("system")).toBe("light");
    expect(toggleThemeMode("dark")).toBe("light");
    expect(toggleThemeMode("light")).toBe("dark");
  });

  it("resolves system appearance from matchMedia", async () => {
    Object.defineProperty(globalThis, "window", {
      value: {
        matchMedia: (query: string) => ({
          matches: query.includes("dark"),
        }),
      },
      configurable: true,
    });

    const { applyTheme, getSystemTheme, resolveTheme } = await import("@/lib/theme");
    expect(getSystemTheme()).toBe("dark");
    expect(resolveTheme("system")).toBe("dark");

    applyTheme("system");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});
