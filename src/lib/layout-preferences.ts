import { readStorageItem, writeStorageItem } from "./app-config";

export type LayoutPreferences = {
  explorerCollapsed: boolean;
  explorerWidth: number;
};

export const EXPLORER_WIDTH_MIN = 220;
export const EXPLORER_WIDTH_MAX = 420;
export const EXPLORER_WIDTH_DEFAULT = 260;
export const RAIL_WIDTH = 48;

const STORAGE_SUFFIX = "layout-v2";
const LEGACY_SUFFIX = "layout-v1";

/** @deprecated use EXPLORER_WIDTH_* */
export const SIDEBAR_WIDTH_MIN = EXPLORER_WIDTH_MIN;
/** @deprecated use EXPLORER_WIDTH_* */
export const SIDEBAR_WIDTH_MAX = EXPLORER_WIDTH_MAX;
/** @deprecated use EXPLORER_WIDTH_* */
export const SIDEBAR_WIDTH_DEFAULT = EXPLORER_WIDTH_DEFAULT;
/** @deprecated use RAIL_WIDTH */
export const SIDEBAR_WIDTH_COLLAPSED = RAIL_WIDTH;

function clampExplorerWidth(width: number): number {
  return Math.min(EXPLORER_WIDTH_MAX, Math.max(EXPLORER_WIDTH_MIN, Math.round(width)));
}

export function defaultLayoutPreferences(): LayoutPreferences {
  return {
    explorerCollapsed: false,
    explorerWidth: EXPLORER_WIDTH_DEFAULT,
  };
}

function migrateLegacy(raw: string): LayoutPreferences | null {
  try {
    const parsed = JSON.parse(raw) as {
      sidebarCollapsed?: boolean;
      sidebarWidth?: number;
      explorerCollapsed?: boolean;
      explorerWidth?: number;
    };
    if (parsed.explorerWidth !== undefined || parsed.explorerCollapsed !== undefined) {
      return {
        explorerCollapsed: parsed.explorerCollapsed === true,
        explorerWidth: clampExplorerWidth(parsed.explorerWidth ?? EXPLORER_WIDTH_DEFAULT),
      };
    }
    return {
      explorerCollapsed: parsed.sidebarCollapsed === true,
      explorerWidth: clampExplorerWidth(parsed.sidebarWidth ?? EXPLORER_WIDTH_DEFAULT),
    };
  } catch {
    return null;
  }
}

export function loadLayoutPreferences(): LayoutPreferences {
  try {
    const raw = readStorageItem(STORAGE_SUFFIX) ?? readStorageItem(LEGACY_SUFFIX);
    if (!raw) return defaultLayoutPreferences();
    return migrateLegacy(raw) ?? defaultLayoutPreferences();
  } catch {
    return defaultLayoutPreferences();
  }
}

export function saveLayoutPreferences(preferences: LayoutPreferences): void {
  writeStorageItem(
    STORAGE_SUFFIX,
    JSON.stringify({
      explorerCollapsed: preferences.explorerCollapsed,
      explorerWidth: clampExplorerWidth(preferences.explorerWidth),
    }),
  );
}
