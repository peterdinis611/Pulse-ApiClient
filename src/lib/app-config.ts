export const APP_NAME = "Pulse";
export const APP_TITLE = `${APP_NAME} API Client`;

const STORAGE_PREFIX = "pulse-api-client";
const LEGACY_STORAGE_PREFIX = "relay-api-client";

export function storageKey(suffix: string): string {
  return `${STORAGE_PREFIX}/${suffix}`;
}

export function readStorageItem(suffix: string): string | null {
  const key = storageKey(suffix);
  const value = localStorage.getItem(key);
  if (value !== null) return value;

  return localStorage.getItem(`${LEGACY_STORAGE_PREFIX}/${suffix}`);
}

export function writeStorageItem(suffix: string, value: string): void {
  localStorage.setItem(storageKey(suffix), value);
}
