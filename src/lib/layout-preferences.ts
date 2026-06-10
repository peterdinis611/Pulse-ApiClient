import { readStorageItem, writeStorageItem } from "./app-config";

export type SidebarPosition = "left" | "right";

export type LayoutPreferences = {
  sidebarPosition: SidebarPosition;
  sidebarCollapsed: boolean;
  sidebarWidth: number;
};

export const SIDEBAR_WIDTH_MIN = 220;
export const SIDEBAR_WIDTH_MAX = 420;
export const SIDEBAR_WIDTH_DEFAULT = 280;
export const SIDEBAR_WIDTH_COLLAPSED = 56;

const STORAGE_SUFFIX = "layout-v1";

export function defaultLayoutPreferences(): LayoutPreferences {
  return {
    sidebarPosition: "left",
    sidebarCollapsed: false,
    sidebarWidth: SIDEBAR_WIDTH_DEFAULT,
  };
}

function clampSidebarWidth(width: number): number {
  return Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, Math.round(width)));
}

export function loadLayoutPreferences(): LayoutPreferences {
  try {
    const raw = readStorageItem(STORAGE_SUFFIX);
    if (!raw) return defaultLayoutPreferences();

    const parsed = JSON.parse(raw) as Partial<LayoutPreferences>;
    return {
      sidebarPosition: parsed.sidebarPosition === "right" ? "right" : "left",
      sidebarCollapsed: parsed.sidebarCollapsed === true,
      sidebarWidth: clampSidebarWidth(parsed.sidebarWidth ?? SIDEBAR_WIDTH_DEFAULT),
    };
  } catch {
    return defaultLayoutPreferences();
  }
}

export function saveLayoutPreferences(preferences: LayoutPreferences): void {
  writeStorageItem(
    STORAGE_SUFFIX,
    JSON.stringify({
      ...preferences,
      sidebarWidth: clampSidebarWidth(preferences.sidebarWidth),
    }),
  );
}
