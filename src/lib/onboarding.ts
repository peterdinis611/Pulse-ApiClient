import { readStorageItem, writeStorageItem } from "@/lib/app-config";
import { getLastSeenVersion } from "@/lib/whats-new";

const COMPLETE_SUFFIX = "onboarding-complete";

export const ONBOARDING_EVENT = "pulse:onboarding";
export const ONBOARDING_COMPLETED_EVENT = "pulse:onboarding-completed";

export function isOnboardingComplete(): boolean {
  try {
    return readStorageItem(COMPLETE_SUFFIX) === "1";
  } catch {
    return false;
  }
}

export function markOnboardingComplete(): void {
  writeStorageItem(COMPLETE_SUFFIX, "1");
}

export function shouldShowOnboarding(): boolean {
  if (isOnboardingComplete()) return false;
  if (getLastSeenVersion() != null) {
    markOnboardingComplete();
    return false;
  }
  return true;
}

export function requestOnboarding(): void {
  window.dispatchEvent(new Event(ONBOARDING_EVENT));
}

export function notifyOnboardingCompleted(): void {
  window.dispatchEvent(new Event(ONBOARDING_COMPLETED_EVENT));
}

export const ONBOARDING_STEPS = ["language", "theme", "workspace"] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];
