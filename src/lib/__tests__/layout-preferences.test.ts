import { beforeEach, describe, expect, it } from "vitest";
import {
  EXPLORER_WIDTH_MAX,
  EXPLORER_WIDTH_MIN,
  defaultLayoutPreferences,
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

  it("clamps explorer width on save", () => {
    saveLayoutPreferences({
      explorerCollapsed: true,
      explorerWidth: 999,
    });
    const loaded = loadLayoutPreferences();
    expect(loaded.explorerCollapsed).toBe(true);
    expect(loaded.explorerWidth).toBe(EXPLORER_WIDTH_MAX);
  });

  it("restores valid saved preferences", () => {
    saveLayoutPreferences({
      explorerCollapsed: false,
      explorerWidth: EXPLORER_WIDTH_MIN,
    });
    expect(loadLayoutPreferences().explorerWidth).toBe(EXPLORER_WIDTH_MIN);
  });
});
