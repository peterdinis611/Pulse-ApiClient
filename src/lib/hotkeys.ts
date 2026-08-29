export const PULSE_FOCUS = {
  url: "url",
  explorerSearch: "explorer-search",
  overviewSearch: "overview-search",
} as const;

export type PulseFocusTarget = (typeof PULSE_FOCUS)[keyof typeof PULSE_FOCUS];

export type WorkspaceHotkey =
  | "toggle-explorer"
  | "toggle-console"
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

export type NavigatorPlatformHint = {
  platform?: string;
  userAgent?: string;
};

export type FormatModShortcutOptions = {
  shift?: boolean;
  /** Override detection (tests). Apple platforms show ⌘; Win/Linux show Ctrl+. */
  apple?: boolean;
};

function navigatorPlatformHint(): NavigatorPlatformHint | undefined {
  if (typeof navigator === "undefined") return undefined;
  return { platform: navigator.platform, userAgent: navigator.userAgent };
}

/** macOS / iOS — labels use ⌘. Win/Linux (and Node tests without navigator) use Ctrl. */
export function isAppleModPlatform(
  nav: NavigatorPlatformHint | null | undefined = navigatorPlatformHint(),
): boolean {
  if (!nav) return false;
  return /Mac|iPhone|iPad|iPod/i.test(`${nav.platform ?? ""} ${nav.userAgent ?? ""}`);
}

export function formatModShortcut(key: string, options: FormatModShortcutOptions = {}): string {
  const apple = options.apple ?? isAppleModPlatform();
  const displayKey = !apple && key === "↵" ? "Enter" : key;

  if (apple) {
    return `⌘${options.shift ? "⇧" : ""}${displayKey}`;
  }

  const parts = ["Ctrl"];
  if (options.shift) parts.push("Shift");
  parts.push(displayKey);
  return parts.join("+");
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
  if (key === "j") return "toggle-console";
  if (key === "t") return "new-tab";
  if (key === "w") return "close-tab";
  if (key === "l") return "focus-url";
  if (key === "f") return "focus-search";
  return null;
}
