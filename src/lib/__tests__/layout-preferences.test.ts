import { beforeEach, describe, expect, it } from "vitest";
import {
  SIDEBAR_WIDTH_MAX,
  SIDEBAR_WIDTH_MIN,
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

  it("clamps sidebar width on save", () => {
    saveLayoutPreferences({
      sidebarPosition: "right",
      sidebarCollapsed: true,
      sidebarWidth: 999,
    });
    const loaded = loadLayoutPreferences();
    expect(loaded.sidebarPosition).toBe("right");
    expect(loaded.sidebarCollapsed).toBe(true);
    expect(loaded.sidebarWidth).toBe(SIDEBAR_WIDTH_MAX);
  });

  it("restores valid saved preferences", () => {
    saveLayoutPreferences({
      sidebarPosition: "left",
      sidebarCollapsed: false,
      sidebarWidth: SIDEBAR_WIDTH_MIN,
    });
    expect(loadLayoutPreferences().sidebarWidth).toBe(SIDEBAR_WIDTH_MIN);
  });
});
