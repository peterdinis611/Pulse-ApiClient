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

export const CUSTOM_THEME_CSS_TEMPLATE = `/* Override Pulse theme variables (applied on top of your selected theme) */
:root {
  /* --primary: oklch(0.52 0.13 205); */
  /* --radius: 0.5rem; */
}

/* Target a specific theme, e.g. dark: */
/* html[data-theme="dark"] {
  --background: oklch(0.11 0.012 210);
  --sidebar: oklch(0.1 0.01 218);
} */

/* Component-level overrides: */
/* .request-url-composite {
  border-radius: 999px;
} */
`;

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

export function getStoredCustomThemeCss(): string | null {
  return readStorageItem(STORAGE_CONTENT_SUFFIX);
}

export function saveCustomThemeCssContent(css: string): void {
  writeStorageItem(STORAGE_CONTENT_SUFFIX, css);
  applyCustomThemeCss(css);
}

export function clearStoredCustomThemeCss(): void {
  localStorage.removeItem(`pulse-api-client/${STORAGE_CONTENT_SUFFIX}`);
  localStorage.removeItem(`pulse-api-client/${STORAGE_PATH_SUFFIX}`);
  localStorage.removeItem(`relay-api-client/${STORAGE_CONTENT_SUFFIX}`);
  localStorage.removeItem(`relay-api-client/${STORAGE_PATH_SUFFIX}`);
}

export function clearBrowserCustomThemeCss(): void {
  clearStoredCustomThemeCss();
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
  const stored = getStoredCustomThemeCss();

  if (canUseTauriIpc()) {
    const settings = await runEffect(getAppSettingsEffect());
    const path = settings.customThemeCssPath?.trim() || null;

    if (stored?.trim()) {
      applyCustomThemeCss(stored);
      return path;
    }

    if (!path) {
      applyCustomThemeCss(null);
      return null;
    }

    const css = await readCustomThemeCss(path);
    applyCustomThemeCss(css);
    return path;
  }

  applyCustomThemeCss(stored);
  return readStorageItem(STORAGE_PATH_SUFFIX);
}

export async function applyCustomThemeFromPath(path: string): Promise<void> {
  if (canUseTauriIpc()) {
    await setCustomThemeCssPath(path);
    const css = await readCustomThemeCss(path);
    saveCustomThemeCssContent(css);
    return;
  }

  throw new Error("Custom theme file paths are only supported in the desktop app");
}

export async function applyCustomThemeFromBrowserFile(file: File): Promise<void> {
  const css = await file.text();
  writeStorageItem(STORAGE_PATH_SUFFIX, file.name);
  saveCustomThemeCssContent(css);
}

export async function clearCustomThemeCss(): Promise<void> {
  if (canUseTauriIpc()) {
    await setCustomThemeCssPath(null);
  }

  clearStoredCustomThemeCss();
  applyCustomThemeCss(null);
}

export async function reloadCustomThemeCss(path: string): Promise<void> {
  const css = canUseTauriIpc()
    ? await readCustomThemeCss(path)
    : getStoredCustomThemeCss() ?? "";
  saveCustomThemeCssContent(css);
}

export async function loadCustomThemeCssForEditor(path: string | null): Promise<string> {
  const stored = getStoredCustomThemeCss()?.trim();
  if (stored) return stored;

  if (path?.trim() && canUseTauriIpc()) {
    return readCustomThemeCss(path.trim());
  }

  return "";
}

export function getBrowserCustomThemePath(): string | null {
  return readStorageItem(STORAGE_PATH_SUFFIX);
}
