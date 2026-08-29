import {
  formatForDisplay,
  type FormatDisplayOptions,
  type Hotkey,
} from "@tanstack/react-hotkeys";

export const PULSE_FOCUS = {
  url: "url",
  explorerSearch: "explorer-search",
  overviewSearch: "overview-search",
} as const;

export type PulseFocusTarget = (typeof PULSE_FOCUS)[keyof typeof PULSE_FOCUS];

export const PULSE_HOTKEYS = {
  send: "Mod+Enter",
  newTab: "Mod+T",
  closeTab: "Mod+W",
  focusUrl: "Mod+L",
  focusSearch: "Mod+F",
  toggleExplorer: "Mod+B",
  toggleConsole: "Mod+J",
  newWindow: "Mod+Shift+N",
  overviewWindow: "Mod+Shift+O",
  closeConsole: "Escape",
} as const satisfies Record<string, Hotkey>;

export type PulseHotkeyId = keyof typeof PULSE_HOTKEYS;

export const PULSE_HOTKEY_CHEATSHEET: Array<{ id: PulseHotkeyId; label: string }> = [
  { id: "send", label: "Send request" },
  { id: "newTab", label: "New tab" },
  { id: "closeTab", label: "Close tab" },
  { id: "focusUrl", label: "Focus URL" },
  { id: "focusSearch", label: "Search" },
  { id: "toggleExplorer", label: "Toggle explorer" },
  { id: "toggleConsole", label: "Toggle console" },
  { id: "newWindow", label: "New window" },
  { id: "overviewWindow", label: "Overview window" },
];

export function pulseFocusSelector(target: PulseFocusTarget): string {
  return `[data-pulse-focus="${target}"]`;
}

export function focusPulseField(target: PulseFocusTarget): boolean {
  const el = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    pulseFocusSelector(target),
  );
  if (!el) return false;
  el.focus();
  if (typeof el.select === "function") el.select();
  return true;
}

export function focusPulseFieldWhenReady(target: PulseFocusTarget, attempts = 16): void {
  const tryFocus = (left: number) => {
    if (focusPulseField(target) || left <= 0) return;
    window.setTimeout(() => tryFocus(left - 1), 40);
  };
  tryFocus(attempts);
}

/** Platform-aware label via TanStack Hotkeys (`⌘B` / `Ctrl+B`). */
export function formatModShortcut(hotkey: Hotkey, options: FormatDisplayOptions = {}): string {
  const formatted = formatForDisplay(hotkey, {
    ...options,
    separatorToken: options.separatorToken ?? (options.platform === "mac" ? "" : undefined),
  });
  if (/[⌘⇧⌥⌃]/.test(formatted)) {
    return formatted.replace(/\s+/g, "");
  }
  return formatted.replace(/↵/g, "Enter");
}
