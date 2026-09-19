import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ONBOARDING_COMPLETED_EVENT,
  ONBOARDING_EVENT,
  ONBOARDING_STEPS,
  isOnboardingComplete,
  markOnboardingComplete,
  notifyOnboardingCompleted,
  requestOnboarding,
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

function installWindow() {
  const target = new EventTarget();
  Object.defineProperty(globalThis, "window", {
    value: target,
    configurable: true,
  });
}

describe("onboarding", () => {
  beforeEach(() => {
    installLocalStorage();
    installWindow();
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

  it("stays complete on later launches after a skip", () => {
    markVersionSeen("2.0.0");
    shouldShowOnboarding();
    expect(shouldShowOnboarding()).toBe(false);
    expect(localStorage.getItem("pulse-api-client/onboarding-complete")).toBe("1");
  });

  it("walks language, theme, then workspace", () => {
    expect(ONBOARDING_STEPS).toEqual(["language", "theme", "workspace"]);
  });

  it("replays from Settings or the command palette", () => {
    const seen: string[] = [];
    window.addEventListener(ONBOARDING_EVENT, () => seen.push("open"));
    requestOnboarding();
    expect(seen).toEqual(["open"]);
  });

  it("notifies What's New only after a first-run finish", () => {
    const seen: string[] = [];
    window.addEventListener(ONBOARDING_COMPLETED_EVENT, () => seen.push("done"));
    notifyOnboardingCompleted();
    expect(seen).toEqual(["done"]);
  });
});
