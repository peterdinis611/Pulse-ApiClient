import { describe, expect, it } from "vitest";
import { matchWorkspaceHotkey, pulseFocusSelector } from "@/lib/hotkeys";

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
