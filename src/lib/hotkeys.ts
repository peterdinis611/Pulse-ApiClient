export const PULSE_FOCUS = {
  url: "url",
  explorerSearch: "explorer-search",
  overviewSearch: "overview-search",
} as const;

export type PulseFocusTarget = (typeof PULSE_FOCUS)[keyof typeof PULSE_FOCUS];

export type WorkspaceHotkey =
  | "toggle-explorer"
  | "new-window"
  | "overview-window"
  | "new-tab"
  | "close-tab"
  | "focus-url"
  | "focus-search";

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

export function isModKey(event: Pick<KeyboardEvent, "metaKey" | "ctrlKey">): boolean {
  return event.metaKey || event.ctrlKey;
}

export function matchWorkspaceHotkey(event: KeyboardEvent): WorkspaceHotkey | null {
  if (!isModKey(event) || event.altKey) return null;
  const key = event.key.toLowerCase();

  if (event.shiftKey) {
    if (key === "n") return "new-window";
    if (key === "o") return "overview-window";
    return null;
  }

  if (key === "b") return "toggle-explorer";
  if (key === "t") return "new-tab";
  if (key === "w") return "close-tab";
  if (key === "l") return "focus-url";
  if (key === "f") return "focus-search";
  return null;
}
