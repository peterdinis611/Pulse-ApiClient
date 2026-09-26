import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { APP_VERSION } from "@/lib/app-config";
import {
  CHANGELOG,
  compareSemver,
  latestRelease,
  unseenReleases,
} from "@/lib/changelog";
import { getLastSeenVersion, markVersionSeen, shouldShowWhatsNew } from "@/lib/whats-new";

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

describe("changelog", () => {
  it("matches the package version", () => {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
    const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as { version: string };
    expect(APP_VERSION).toBe(pkg.version);
    expect(CHANGELOG.some((release) => release.version === APP_VERSION)).toBe(true);
  });

  it("orders semver and filters unseen releases", () => {
    expect(compareSemver("0.3.0", "0.3.0")).toBe(0);
    expect(compareSemver("0.3.0", "0.4.0")).toBe(-1);
    expect(compareSemver("1.0.0", "0.9.9")).toBe(1);
    expect(unseenReleases(null, "0.3.0").map((release) => release.version)).toEqual(["0.3.0"]);
    expect(unseenReleases("0.3.0", "0.3.0")).toEqual([]);
    expect(latestRelease("0.3.0")?.title.en).toMatch(/git/i);
    expect(latestRelease("2.0.0")?.title.en).toMatch(/2\.0/);
    expect(latestRelease("2.1.0")?.title.en).toMatch(/round-trip/i);
    expect(unseenReleases("0.3.0", "2.0.0").map((release) => release.version)).toEqual(["2.0.0"]);
    expect(unseenReleases("2.0.0", "2.1.0").map((release) => release.version)).toEqual(["2.1.0"]);
    expect(CHANGELOG[0]?.changes.length).toBeGreaterThan(4);
    expect(
      CHANGELOG.find((release) => release.version === "2.0.0")?.changes.some(
        (change) => change.id === "onboarding",
      ),
    ).toBe(true);
    expect(
      CHANGELOG.find((release) => release.version === "2.1.0")?.changes.some(
        (change) => change.id === "bruno-insomnia-export",
      ),
    ).toBe(true);
  });

  it("ships bilingual copy for every change", () => {
    for (const release of CHANGELOG) {
      expect(release.title.en.trim()).not.toBe("");
      expect(release.title.sk.trim()).not.toBe("");
      expect(release.changes.length).toBeGreaterThan(0);
      for (const change of release.changes) {
        expect(change.title.en.trim()).not.toBe("");
        expect(change.title.sk.trim()).not.toBe("");
        expect(change.detail.en.trim()).not.toBe("");
        expect(change.detail.sk.trim()).not.toBe("");
      }
    }
  });
});

describe("whats-new storage", () => {
  beforeEach(() => {
    installLocalStorage();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("shows once until the version is marked seen", () => {
    expect(getLastSeenVersion()).toBeNull();
    expect(shouldShowWhatsNew("0.3.0")).toBe(true);
    markVersionSeen("0.3.0");
    expect(getLastSeenVersion()).toBe("0.3.0");
    expect(shouldShowWhatsNew("0.3.0")).toBe(false);
  });
});
