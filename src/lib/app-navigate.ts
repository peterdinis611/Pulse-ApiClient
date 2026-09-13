import type { MainView } from "@/types";

export type PulseNavigateDetail = {
  view?: MainView;
  settingsSection?: string;
  docsSection?: string;
};

const EVENT = "pulse:navigate";

export function navigatePulse(detail: PulseNavigateDetail): void {
  window.dispatchEvent(new CustomEvent<PulseNavigateDetail>(EVENT, { detail }));
}

export function onPulseNavigate(handler: (detail: PulseNavigateDetail) => void): () => void {
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<PulseNavigateDetail>).detail;
    if (detail) handler(detail);
  };
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
