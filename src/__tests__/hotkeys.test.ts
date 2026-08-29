import { describe, expect, it } from "vitest";
import {
  formatModShortcut,
  isAppleModPlatform,
  matchWorkspaceHotkey,
  pulseFocusSelector,
} from "@/lib/hotkeys";

function keyEvent(
  key: string,
  mods: Partial<Pick<KeyboardEvent, "metaKey" | "ctrlKey" | "shiftKey" | "altKey">> = {},
): KeyboardEvent {
  return {
    key,
    metaKey: Boolean(mods.metaKey),
    ctrlKey: Boolean(mods.ctrlKey),
    shiftKey: Boolean(mods.shiftKey),
    altKey: Boolean(mods.altKey),
  } as KeyboardEvent;
}

describe("workspace hotkeys", () => {
  it("matches core shortcuts with cmd or ctrl", () => {
    expect(matchWorkspaceHotkey(keyEvent("t", { metaKey: true }))).toBe("new-tab");
    expect(matchWorkspaceHotkey(keyEvent("w", { ctrlKey: true }))).toBe("close-tab");
    expect(matchWorkspaceHotkey(keyEvent("l", { metaKey: true }))).toBe("focus-url");
    expect(matchWorkspaceHotkey(keyEvent("f", { metaKey: true }))).toBe("focus-search");
    expect(matchWorkspaceHotkey(keyEvent("b", { metaKey: true }))).toBe("toggle-explorer");
    expect(matchWorkspaceHotkey(keyEvent("j", { ctrlKey: true }))).toBe("toggle-console");
  });

  it("matches shifted window shortcuts", () => {
    expect(matchWorkspaceHotkey(keyEvent("n", { metaKey: true, shiftKey: true }))).toBe("new-window");
    expect(matchWorkspaceHotkey(keyEvent("o", { ctrlKey: true, shiftKey: true }))).toBe(
      "overview-window",
    );
  });

  it("ignores unmodified and alt combinations", () => {
    expect(matchWorkspaceHotkey(keyEvent("t"))).toBeNull();
    expect(matchWorkspaceHotkey(keyEvent("t", { metaKey: true, altKey: true }))).toBeNull();
  });

  it("builds focus selectors", () => {
    expect(pulseFocusSelector("url")).toBe('[data-pulse-focus="url"]');
  });
});

describe("mod shortcut labels", () => {
  it("detects Apple platforms from platform or UA", () => {
    expect(isAppleModPlatform({ platform: "MacIntel" })).toBe(true);
    expect(isAppleModPlatform({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)" })).toBe(
      true,
    );
    expect(isAppleModPlatform({ platform: "Win32" })).toBe(false);
    expect(isAppleModPlatform({ platform: "Linux x86_64" })).toBe(false);
    expect(isAppleModPlatform(null)).toBe(false);
    expect(isAppleModPlatform({})).toBe(false);
  });

  it("formats ⌘ on Apple and Ctrl+ on Win/Linux", () => {
    expect(formatModShortcut("B", { apple: true })).toBe("⌘B");
    expect(formatModShortcut("B", { apple: false })).toBe("Ctrl+B");
    expect(formatModShortcut("↵", { apple: true })).toBe("⌘↵");
    expect(formatModShortcut("↵", { apple: false })).toBe("Ctrl+Enter");
    expect(formatModShortcut("Enter", { apple: true })).toBe("⌘Enter");
    expect(formatModShortcut("Enter", { apple: false })).toBe("Ctrl+Enter");
    expect(formatModShortcut("N", { shift: true, apple: true })).toBe("⌘⇧N");
    expect(formatModShortcut("N", { shift: true, apple: false })).toBe("Ctrl+Shift+N");
  });
});
