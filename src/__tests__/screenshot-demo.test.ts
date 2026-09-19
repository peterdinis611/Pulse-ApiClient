import { afterEach, describe, expect, it } from "vitest";
import { getScreenshotMainView, getScreenshotShotParam, isScreenshotMode } from "@/lib/screenshot-demo";

function setSearch(search: string) {
  Object.defineProperty(globalThis, "window", {
    value: { location: { search } },
    configurable: true,
  });
}

describe("screenshot mode", () => {
  afterEach(() => {
    setSearch("");
  });

  it("stays off without a shot query", () => {
    setSearch("");
    expect(isScreenshotMode()).toBe(false);
  });

  it("skips auto onboarding while capturing Settings", () => {
    setSearch("?shot=settings");
    expect(isScreenshotMode()).toBe(true);
    expect(getScreenshotMainView()).toBe("settings");
  });

  it("keeps the boot screen when capturing preload", () => {
    setSearch("?shot=boot");
    expect(isScreenshotMode()).toBe(false);
    expect(getScreenshotShotParam()).toBe("boot");
  });

  it("ignores unknown shot names", () => {
    setSearch("?shot=unknown");
    expect(isScreenshotMode()).toBe(false);
    expect(getScreenshotMainView()).toBe("request");
  });
});
