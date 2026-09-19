import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  isOnboardingComplete,
  markOnboardingComplete,
  shouldShowOnboarding,
} from "@/lib/onboarding";
import { markVersionSeen } from "@/lib/whats-new";

function installLocalStorage() {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => store.clear(),
    },
    configurable: true,
  });
}

describe("onboarding", () => {
  beforeEach(() => {
    installLocalStorage();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("shows on a blank install", () => {
    expect(isOnboardingComplete()).toBe(false);
    expect(shouldShowOnboarding()).toBe(true);
  });

  it("hides after the wizard is finished", () => {
    markOnboardingComplete();
    expect(isOnboardingComplete()).toBe(true);
    expect(shouldShowOnboarding()).toBe(false);
  });

  it("skips for someone who already used Pulse", () => {
    markVersionSeen("2.0.0");
    expect(shouldShowOnboarding()).toBe(false);
    expect(isOnboardingComplete()).toBe(true);
  });
});
