import { describe, expect, it } from "vitest";
import { matchesKeyboardEvent } from "@tanstack/react-hotkeys";
import {
  formatModShortcut,
  PULSE_HOTKEYS,
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
  it("matches core shortcuts with Mod on mac and windows", () => {
    expect(matchesKeyboardEvent(keyEvent("t", { metaKey: true }), PULSE_HOTKEYS.newTab, "mac")).toBe(
      true,
    );
    expect(
      matchesKeyboardEvent(keyEvent("w", { ctrlKey: true }), PULSE_HOTKEYS.closeTab, "windows"),
    ).toBe(true);
    expect(
      matchesKeyboardEvent(keyEvent("l", { metaKey: true }), PULSE_HOTKEYS.focusUrl, "mac"),
    ).toBe(true);
    expect(
      matchesKeyboardEvent(keyEvent("f", { metaKey: true }), PULSE_HOTKEYS.focusSearch, "mac"),
    ).toBe(true);
    expect(
      matchesKeyboardEvent(keyEvent("b", { metaKey: true }), PULSE_HOTKEYS.toggleExplorer, "mac"),
    ).toBe(true);
    expect(
      matchesKeyboardEvent(keyEvent("j", { ctrlKey: true }), PULSE_HOTKEYS.toggleConsole, "windows"),
    ).toBe(true);
  });

  it("matches shifted window shortcuts", () => {
    expect(
      matchesKeyboardEvent(
        keyEvent("n", { metaKey: true, shiftKey: true }),
        PULSE_HOTKEYS.newWindow,
        "mac",
      ),
    ).toBe(true);
    expect(
      matchesKeyboardEvent(
        keyEvent("o", { ctrlKey: true, shiftKey: true }),
        PULSE_HOTKEYS.overviewWindow,
        "windows",
      ),
    ).toBe(true);
  });

  it("ignores unmodified and alt combinations", () => {
    expect(matchesKeyboardEvent(keyEvent("t"), PULSE_HOTKEYS.newTab, "mac")).toBe(false);
    expect(
      matchesKeyboardEvent(
        keyEvent("t", { metaKey: true, altKey: true }),
        PULSE_HOTKEYS.newTab,
        "mac",
      ),
    ).toBe(false);
  });

  it("builds focus selectors", () => {
    expect(pulseFocusSelector("url")).toBe('[data-pulse-focus="url"]');
  });
});

describe("mod shortcut labels", () => {
  it("formats ⌘ on Apple and Ctrl+ on Win/Linux via formatForDisplay", () => {
    expect(formatModShortcut(PULSE_HOTKEYS.toggleExplorer, { platform: "mac" })).toBe("⌘B");
    expect(formatModShortcut(PULSE_HOTKEYS.toggleExplorer, { platform: "windows" })).toBe("Ctrl+B");
    expect(formatModShortcut(PULSE_HOTKEYS.send, { platform: "mac" })).toBe("⌘↵");
    expect(formatModShortcut(PULSE_HOTKEYS.send, { platform: "windows" })).toBe("Ctrl+Enter");
    expect(formatModShortcut(PULSE_HOTKEYS.newWindow, { platform: "mac" })).toBe("⌘⇧N");
    expect(formatModShortcut(PULSE_HOTKEYS.newWindow, { platform: "windows" })).toBe("Ctrl+Shift+N");
  });
});
