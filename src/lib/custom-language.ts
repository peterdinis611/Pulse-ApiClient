import { open } from "@tauri-apps/plugin-dialog";
import type { AppSettings } from "@/types";
import { readStorageItem } from "./app-config";
import { invokeEffect } from "./effect/tauri";
import { runEffect } from "./effect/run";
import { getAppSettingsEffect } from "./http-ipc";
import {
  applyCustomLanguagePack,
  clearCustomLanguagePackState,
  getCustomLanguagePack,
  languagePackTemplateJson,
  parseLanguagePack,
  saveCustomLanguagePath,
} from "./i18n";
import { canUseTauriIpc } from "./tauri-runtime";

const STORAGE_PATH_SUFFIX = "custom-language-json-path";

export async function readCustomLanguageJson(path: string): Promise<string> {
  return runEffect(invokeEffect<string>("read_custom_language_json", { path }));
}

export async function setCustomLanguageJsonPath(path: string | null): Promise<AppSettings> {
  return runEffect(invokeEffect<AppSettings>("set_custom_language_json", { path }));
}

export async function saveLocaleToBackend(locale: string): Promise<void> {
  if (!canUseTauriIpc()) return;
  await runEffect(invokeEffect<AppSettings>("set_locale", { locale }));
}

/** Native dialog — OS-agnostic; do not hardcode user-home paths. */
export async function pickCustomLanguageJsonFile(): Promise<string | null> {
  const selected = await open({
    multiple: false,
    directory: false,
    filters: [{ name: "JSON", extensions: ["json"] }],
  });

  if (selected === null) return null;
  return Array.isArray(selected) ? selected[0] ?? null : selected;
}

export async function loadAndApplyCustomLanguage(): Promise<string | null> {
  const storedPack = getCustomLanguagePack();

  if (canUseTauriIpc()) {
    const settings = await runEffect(getAppSettingsEffect());
    const path = settings.customLanguageJsonPath?.trim() || null;

    if (storedPack) {
      applyCustomLanguagePack(storedPack, path ?? undefined);
      return path;
    }

    if (!path) {
      applyCustomLanguagePack(null);
      return null;
    }

    const raw = await readCustomLanguageJson(path);
    applyCustomLanguagePack(parseLanguagePack(raw), path);
    return path;
  }

  return readStorageItem(STORAGE_PATH_SUFFIX);
}

export async function applyCustomLanguageFromPath(path: string): Promise<void> {
  if (canUseTauriIpc()) {
    await setCustomLanguageJsonPath(path);
    const raw = await readCustomLanguageJson(path);
    applyCustomLanguagePack(parseLanguagePack(raw), path);
    return;
  }

  throw new Error("Custom language file paths are only supported in the desktop app");
}

export async function applyCustomLanguageFromBrowserFile(file: File): Promise<void> {
  const raw = await file.text();
  applyCustomLanguagePack(parseLanguagePack(raw), file.name);
}

export async function applyCustomLanguageFromText(raw: string): Promise<void> {
  applyCustomLanguagePack(parseLanguagePack(raw), null);
  if (canUseTauriIpc()) {
    await setCustomLanguageJsonPath(null);
  }
}

export async function clearCustomLanguage(): Promise<void> {
  if (canUseTauriIpc()) {
    await setCustomLanguageJsonPath(null);
  }
  clearCustomLanguagePackState();
}

export async function reloadCustomLanguage(path: string): Promise<void> {
  if (canUseTauriIpc()) {
    const raw = await readCustomLanguageJson(path);
    applyCustomLanguagePack(parseLanguagePack(raw), path);
    return;
  }

  const stored = getCustomLanguagePack();
  if (stored) applyCustomLanguagePack(stored, path);
}

export function getBrowserCustomLanguagePath(): string | null {
  return readStorageItem(STORAGE_PATH_SUFFIX);
}

export { languagePackTemplateJson, parseLanguagePack, saveCustomLanguagePath };
