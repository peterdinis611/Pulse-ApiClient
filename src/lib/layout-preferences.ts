import { readStorageItem, writeStorageItem } from "./app-config";

export type LayoutPreferences = {
  explorerCollapsed: boolean;
  explorerWidth: number;
  consoleHeight: number;
  workspaceSplitRatio: number;
};

export const EXPLORER_WIDTH_MIN = 220;
export const EXPLORER_WIDTH_MAX = 420;
export const EXPLORER_WIDTH_DEFAULT = 260;
export const RAIL_WIDTH = 48;
export const CONSOLE_HEIGHT_MIN = 120;
export const CONSOLE_HEIGHT_MAX = 480;
export const CONSOLE_HEIGHT_DEFAULT = 208;
export const WORKSPACE_SPLIT_RATIO_MIN = 22;
export const WORKSPACE_SPLIT_RATIO_MAX = 78;
export const WORKSPACE_SPLIT_RATIO_DEFAULT = 52;

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

export function clampConsoleHeight(height: number): number {
  return Math.min(CONSOLE_HEIGHT_MAX, Math.max(CONSOLE_HEIGHT_MIN, Math.round(height)));
}

export function clampWorkspaceSplitRatio(ratio: number): number {
  return Math.min(
    WORKSPACE_SPLIT_RATIO_MAX,
    Math.max(WORKSPACE_SPLIT_RATIO_MIN, Math.round(ratio)),
  );
}

export function defaultLayoutPreferences(): LayoutPreferences {
  return {
    explorerCollapsed: false,
    explorerWidth: EXPLORER_WIDTH_DEFAULT,
    consoleHeight: CONSOLE_HEIGHT_DEFAULT,
    workspaceSplitRatio: WORKSPACE_SPLIT_RATIO_DEFAULT,
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
    const defaults = defaultLayoutPreferences();
    if (parsed.explorerWidth !== undefined || parsed.explorerCollapsed !== undefined) {
      return {
        explorerCollapsed: parsed.explorerCollapsed === true,
        explorerWidth: clampExplorerWidth(parsed.explorerWidth ?? EXPLORER_WIDTH_DEFAULT),
        consoleHeight: clampConsoleHeight(
          (parsed as { consoleHeight?: number }).consoleHeight ?? defaults.consoleHeight,
        ),
        workspaceSplitRatio: clampWorkspaceSplitRatio(
          (parsed as { workspaceSplitRatio?: number }).workspaceSplitRatio ??
            defaults.workspaceSplitRatio,
        ),
      };
    }
    return {
      explorerCollapsed: parsed.sidebarCollapsed === true,
      explorerWidth: clampExplorerWidth(parsed.sidebarWidth ?? EXPLORER_WIDTH_DEFAULT),
      consoleHeight: clampConsoleHeight(
        (parsed as { consoleHeight?: number }).consoleHeight ?? defaults.consoleHeight,
      ),
      workspaceSplitRatio: clampWorkspaceSplitRatio(
        (parsed as { workspaceSplitRatio?: number }).workspaceSplitRatio ??
          defaults.workspaceSplitRatio,
      ),
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

export function saveLayoutPreferences(preferences: Partial<LayoutPreferences>): void {
  const current = loadLayoutPreferences();
  writeStorageItem(
    STORAGE_SUFFIX,
    JSON.stringify({
      explorerCollapsed: preferences.explorerCollapsed ?? current.explorerCollapsed,
      explorerWidth: clampExplorerWidth(preferences.explorerWidth ?? current.explorerWidth),
      consoleHeight: clampConsoleHeight(preferences.consoleHeight ?? current.consoleHeight),
      workspaceSplitRatio: clampWorkspaceSplitRatio(
        preferences.workspaceSplitRatio ?? current.workspaceSplitRatio,
      ),
    }),
  );
}
