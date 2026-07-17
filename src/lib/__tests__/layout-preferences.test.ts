import { beforeEach, describe, expect, it } from "vitest";
import {
  EXPLORER_WIDTH_MIN,
  clampExplorerWidth,
  defaultLayoutPreferences,
  getExplorerWidthMax,
  loadLayoutPreferences,
  saveLayoutPreferences,
} from "../layout-preferences";

describe("layout-preferences", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    const mockStorage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    };
    Object.defineProperty(globalThis, "localStorage", {
      value: mockStorage,
      configurable: true,
    });
  });

  it("returns defaults when storage is empty", () => {
    expect(loadLayoutPreferences()).toEqual(defaultLayoutPreferences());
  });

  it("clamps explorer width to viewport-aware max on save", () => {
    const viewportMax = getExplorerWidthMax(1280);
    saveLayoutPreferences({
      ...defaultLayoutPreferences(),
      explorerCollapsed: true,
      explorerWidth: 9999,
    });
    const loaded = loadLayoutPreferences();
    expect(loaded.explorerCollapsed).toBe(true);
    expect(loaded.explorerWidth).toBe(viewportMax);
  });

  it("restores valid saved preferences", () => {
    saveLayoutPreferences({
      ...defaultLayoutPreferences(),
      explorerCollapsed: false,
      explorerWidth: EXPLORER_WIDTH_MIN,
    });
    expect(loadLayoutPreferences().explorerWidth).toBe(EXPLORER_WIDTH_MIN);
  });

  it("allows explorer almost full window width", () => {
    expect(getExplorerWidthMax(1440)).toBeGreaterThan(800);
    expect(clampExplorerWidth(900, 1440)).toBe(900);
  });
});
