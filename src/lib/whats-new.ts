import { APP_VERSION, readStorageItem, writeStorageItem } from "@/lib/app-config";
import { unseenReleases } from "@/lib/changelog";

const LAST_SEEN_SUFFIX = "last-seen-version";

export const WHATS_NEW_EVENT = "pulse:whats-new";
export const PRODUCT_TOUR_EVENT = "pulse:product-tour";

export function getLastSeenVersion(): string | null {
  try {
    return readStorageItem(LAST_SEEN_SUFFIX);
  } catch {
    return null;
  }
}

export function markVersionSeen(version: string = APP_VERSION): void {
  writeStorageItem(LAST_SEEN_SUFFIX, version);
}

export function shouldShowWhatsNew(current: string = APP_VERSION): boolean {
  const lastSeen = getLastSeenVersion();
  if (lastSeen === current) return false;
  return unseenReleases(lastSeen, current).length > 0;
}

export function requestWhatsNew(): void {
  window.dispatchEvent(new Event(WHATS_NEW_EVENT));
}

export function requestProductTour(): void {
  window.dispatchEvent(new Event(PRODUCT_TOUR_EVENT));
}
