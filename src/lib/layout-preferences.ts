import { readStorageItem, writeStorageItem } from "./app-config";

export type LayoutPreferences = {
  explorerCollapsed: boolean;
  explorerWidth: number;
  consoleHeight: number;
  workspaceSplitRatio: number;
};

export const EXPLORER_WIDTH_MIN = 240;
/** Absolute ceiling; effective max is also capped by viewport. */
export const EXPLORER_WIDTH_MAX = 1400;
export const EXPLORER_WIDTH_DEFAULT = 300;
export const RAIL_WIDTH = 48;
/** Minimum width reserved for the main workspace when dragging the explorer. */
export const MAIN_CONTENT_MIN_WIDTH = 320;

export const CONSOLE_HEIGHT_MIN = 100;
/** Absolute ceiling; effective max is also capped by viewport. */
export const CONSOLE_HEIGHT_MAX = 900;
export const CONSOLE_HEIGHT_DEFAULT = 208;
/** Minimum height reserved above the console (request + status chrome). */
export const MAIN_CONTENT_MIN_HEIGHT = 220;

export const WORKSPACE_SPLIT_RATIO_MIN = 8;
export const WORKSPACE_SPLIT_RATIO_MAX = 92;
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

function viewportWidth(): number {
  return typeof window !== "undefined" ? window.innerWidth : 1280;
}

function viewportHeight(): number {
  return typeof window !== "undefined" ? window.innerHeight : 800;
}

/** Max explorer width for the current (or given) viewport — nearly full window. */
export function getExplorerWidthMax(width = viewportWidth()): number {
  return Math.min(
    EXPLORER_WIDTH_MAX,
    Math.max(EXPLORER_WIDTH_MIN, width - RAIL_WIDTH - MAIN_CONTENT_MIN_WIDTH),
  );
}

/** Max console height for the current (or given) viewport. */
export function getConsoleHeightMax(height = viewportHeight()): number {
  return Math.min(
    CONSOLE_HEIGHT_MAX,
    Math.max(CONSOLE_HEIGHT_MIN, height - MAIN_CONTENT_MIN_HEIGHT),
  );
}

export function clampExplorerWidth(width: number, viewportW = viewportWidth()): number {
  return Math.min(getExplorerWidthMax(viewportW), Math.max(EXPLORER_WIDTH_MIN, Math.round(width)));
}

export function clampConsoleHeight(height: number, viewportH = viewportHeight()): number {
  return Math.min(getConsoleHeightMax(viewportH), Math.max(CONSOLE_HEIGHT_MIN, Math.round(height)));
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
