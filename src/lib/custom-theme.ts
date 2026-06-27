import { open } from "@tauri-apps/plugin-dialog";
import type { AppSettings } from "@/types";
import { readStorageItem, writeStorageItem } from "./app-config";
import { invokeEffect } from "./effect/tauri";
import { runEffect } from "./effect/run";
import { getAppSettingsEffect } from "./http-ipc";
import { canUseTauriIpc } from "./tauri-runtime";

export const CUSTOM_THEME_STYLE_ID = "pulse-custom-theme";
const STORAGE_CONTENT_SUFFIX = "custom-theme-css";
const STORAGE_PATH_SUFFIX = "custom-theme-css-path";

export function applyCustomThemeCss(css: string | null | undefined): void {
  const existing = document.getElementById(CUSTOM_THEME_STYLE_ID);
  existing?.remove();

  const trimmed = css?.trim();
  if (!trimmed) return;

  const style = document.createElement("style");
  style.id = CUSTOM_THEME_STYLE_ID;
  style.textContent = trimmed;
  document.head.appendChild(style);
}

export function clearBrowserCustomThemeCss(): void {
  localStorage.removeItem(`pulse-api-client/${STORAGE_CONTENT_SUFFIX}`);
  localStorage.removeItem(`pulse-api-client/${STORAGE_PATH_SUFFIX}`);
  applyCustomThemeCss(null);
}

export async function readCustomThemeCss(path: string): Promise<string> {
  return runEffect(invokeEffect<string>("read_custom_theme_css", { path }));
}

export async function setCustomThemeCssPath(path: string | null): Promise<AppSettings> {
  return runEffect(invokeEffect<AppSettings>("set_custom_theme_css", { path }));
}

export async function pickCustomThemeCssFile(): Promise<string | null> {
  const selected = await open({
    multiple: false,
    directory: false,
    filters: [{ name: "CSS", extensions: ["css"] }],
  });

  if (selected === null) return null;
  return Array.isArray(selected) ? selected[0] ?? null : selected;
}

export async function loadAndApplyCustomThemeCss(): Promise<string | null> {
  if (canUseTauriIpc()) {
    const settings = await runEffect(getAppSettingsEffect());
    const path = settings.customThemeCssPath?.trim() || null;
    if (!path) {
      applyCustomThemeCss(null);
      return null;
    }

    const css = await readCustomThemeCss(path);
    applyCustomThemeCss(css);
    return path;
  }

  const css = readStorageItem(STORAGE_CONTENT_SUFFIX);
  applyCustomThemeCss(css);
  return readStorageItem(STORAGE_PATH_SUFFIX);
}

export async function applyCustomThemeFromPath(path: string): Promise<void> {
  if (canUseTauriIpc()) {
    await setCustomThemeCssPath(path);
    const css = await readCustomThemeCss(path);
    applyCustomThemeCss(css);
    return;
  }

  throw new Error("Custom theme file paths are only supported in the desktop app");
}

export async function applyCustomThemeFromBrowserFile(file: File): Promise<void> {
  const css = await file.text();
  writeStorageItem(STORAGE_CONTENT_SUFFIX, css);
  writeStorageItem(STORAGE_PATH_SUFFIX, file.name);
  applyCustomThemeCss(css);
}

export async function clearCustomThemeCss(): Promise<void> {
  if (canUseTauriIpc()) {
    await setCustomThemeCssPath(null);
  } else {
    clearBrowserCustomThemeCss();
    return;
  }

  applyCustomThemeCss(null);
}

export async function reloadCustomThemeCss(path: string): Promise<void> {
  const css = canUseTauriIpc()
    ? await readCustomThemeCss(path)
    : readStorageItem(STORAGE_CONTENT_SUFFIX);
  applyCustomThemeCss(css);
}

export function getBrowserCustomThemePath(): string | null {
  return readStorageItem(STORAGE_PATH_SUFFIX);
}
