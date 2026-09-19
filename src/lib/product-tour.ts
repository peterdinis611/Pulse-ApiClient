import { driver, type DriveStep } from "driver.js";
import type { BuiltInLocale } from "@/lib/i18n";
import { navigatePulse } from "@/lib/app-navigate";
import { pickCopy, type LocaleCopy } from "@/lib/changelog";
import type { MainView } from "@/types";

export type ProductTourContext = {
  locale: BuiltInLocale;
  goToView: (view: MainView) => void;
  ensureExplorerOpen: () => void;
  onDestroyed?: () => void;
};

type TourStepMeta = {
  view?: MainView;
  settingsSection?: string;
  docsSection?: string;
};

type TourStepDef = {
  selector?: string;
  side?: "top" | "right" | "bottom" | "left";
  title: LocaleCopy;
  description: LocaleCopy;
} & TourStepMeta;

const TOUR_STEPS: TourStepDef[] = [
  {
    view: "overview",
    title: { en: "Pulse 2.0 is on disk", sk: "Pulse 2.0 je na disku" },
    description: {
      en: "Git is the workspace. This walkthrough highlights where the new YAML folder, secrets, OpenAPI explorer, and mock server live.",
      sk: "Git je workspace. Táto prehliadka ukáže, kde je nový YAML priečinok, secrety, OpenAPI explorer a mock server.",
    },
  },
  {
    selector: "[data-tour='rail-settings']",
    side: "right",
    title: { en: "Settings rail", sk: "Nastavenia" },
    description: {
      en: "Attach a Git folder, start the mock server, and reopen these notes from Data & storage.",
      sk: "Tu pripojíš Git priečinok, spustíš mock server a znova otvoríš tieto poznámky — Dáta a úložisko.",
    },
  },
  {
    view: "settings",
    settingsSection: "appearance",
    selector: "[data-tour='onboarding']",
    side: "left",
    title: { en: "First-run setup", sk: "Úvodné nastavenie" },
    description: {
      en: "Language, theme, and how the desk opens. Replay this wizard anytime — the same controls live here and under Layout.",
      sk: "Jazyk, téma a ako sa otvorí stôl. Sprievodcu spustíš kedykoľvek — tie isté ovládania sú tu a v Rozložení.",
    },
  },
  {
    view: "settings",
    settingsSection: "data",
    selector: "[data-tour='git-workspace']",
    side: "left",
    title: { en: "Attach a Git folder", sk: "Pripojiť Git priečinok" },
    description: {
      en: "The folder is canonical: pulse.yaml, collections/, environments/. SQLite keeps history, cache, and session only.",
      sk: "Priečinok je kanonický: pulse.yaml, collections/, environments/. SQLite ostáva na históriu, cache a reláciu.",
    },
  },
  {
    view: "settings",
    settingsSection: "data",
    selector: "[data-tour='mock-server']",
    side: "left",
    title: { en: "Local mock server", sk: "Lokálny mock server" },
    description: {
      en: "Locks 127.0.0.1:4010. Every saved example is a route — pick with ?example=name or ?status=404. No hidden headers.",
      sk: "Zamkne 127.0.0.1:4010. Každý uložený príklad je route — vyber ?example=name alebo ?status=404. Žiadne skryté hlavičky.",
    },
  },
  {
    view: "request",
    selector: "[data-tour='openapi-import']",
    side: "right",
    title: { en: "OpenAPI explorer", sk: "OpenAPI explorer" },
    description: {
      en: "Import / export lives here. OpenAPI explorer fetches a spec and opens operations as requests — YAML when Git is attached.",
      sk: "Import a export je tu. OpenAPI explorer načíta špecifikáciu a otvorí operácie ako requesty — YAML, keď je Git pripojený.",
    },
  },
  {
    view: "environments",
    selector: "[data-tour='environments']",
    side: "bottom",
    title: { en: "Secrets stay local", sk: "Secret hodnoty ostávajú lokálne" },
    description: {
      en: "Put tokens in gitignored .env and reference {{secret.NAME}}. Values are never written into collection YAML.",
      sk: "Tokeny daj do gitignorovaného .env a odkáž {{secret.NAME}}. Do YAML kolekcie sa hodnoty nezapíšu.",
    },
  },
  {
    view: "request",
    selector: "[data-tour='protocol']",
    side: "bottom",
    title: { en: "HTTP, WebSocket, SSE", sk: "HTTP, WebSocket, SSE" },
    description: {
      en: "Switch to WS, set the body to GraphQL, then Subscribe — Pulse speaks graphql-transport-ws.",
      sk: "Prepni na WS, body na GraphQL a Subscribe — Pulse hovorí graphql-transport-ws.",
    },
  },
  {
    view: "docs",
    docsSection: "git-workspace",
    selector: "[data-tour='docs']",
    side: "bottom",
    title: { en: "Field manual", sk: "Field manual" },
    description: {
      en: "Git workspace, MCP, privacy, and the rest of the desk live in Docs. Replay this tour anytime from Settings or Cmd/Ctrl+K.",
      sk: "Git workspace, MCP, súkromie a zvyšok stola je v Docs. Túto prehliadku kedykoľvek spustíš z Nastavení alebo Cmd/Ctrl+K.",
    },
  },
];

let active: ReturnType<typeof driver> | null = null;

function applyStepView(step: TourStepDef | undefined, ctx: ProductTourContext): void {
  if (!step) return;
  if (step.view) ctx.goToView(step.view);
  if (step.view === "request") ctx.ensureExplorerOpen();
  if (step.settingsSection || step.docsSection) {
    window.setTimeout(() => {
      navigatePulse({
        view: step.view,
        settingsSection: step.settingsSection,
        docsSection: step.docsSection,
      });
    }, 40);
  }
}

function toDriveStep(step: TourStepDef, locale: BuiltInLocale): DriveStep {
  return {
    element: step.selector,
    waitForElement: step.selector ? 1800 : undefined,
    skipMissingElement: true,
    popover: {
      title: pickCopy(step.title, locale),
      description: pickCopy(step.description, locale),
      side: step.side ?? "bottom",
      align: "start",
    },
  };
}

export function stopProductTour(): void {
  active?.destroy();
  active = null;
}

export function startProductTour(ctx: ProductTourContext): void {
  stopProductTour();
  applyStepView(TOUR_STEPS[0], ctx);

  const instance = driver({
    steps: TOUR_STEPS.map((step) => toDriveStep(step, ctx.locale)),
    showProgress: true,
    animate: true,
    smoothScroll: true,
    stagePadding: 10,
    stageRadius: 8,
    overlayColor: "oklch(0.16 0.03 210)",
    overlayOpacity: 0.58,
    allowClose: true,
    popoverClass: "pulse-driver-popover",
    progressText: "{{current}} / {{total}}",
    nextBtnText: ctx.locale === "sk" ? "Ďalej" : "Next",
    prevBtnText: ctx.locale === "sk" ? "Späť" : "Back",
    doneBtnText: ctx.locale === "sk" ? "Hotovo" : "Done",
    onNextClick: (_element, _step, { driver: tour }) => {
      const index = tour.getActiveIndex() ?? 0;
      applyStepView(TOUR_STEPS[index + 1], ctx);
      window.setTimeout(() => tour.moveNext(), 50);
    },
    onPrevClick: (_element, _step, { driver: tour }) => {
      const index = tour.getActiveIndex() ?? 0;
      applyStepView(TOUR_STEPS[index - 1], ctx);
      window.setTimeout(() => tour.movePrevious(), 50);
    },
    onDestroyed: () => {
      if (active === instance) active = null;
      ctx.onDestroyed?.();
    },
  });

  active = instance;
  window.setTimeout(() => {
    if (active === instance) instance.drive();
  }, 80);
}

export const PRODUCT_TOUR_STEP_COUNT = TOUR_STEPS.length;

export const PRODUCT_TOUR_SELECTORS = TOUR_STEPS.map((step) => step.selector).filter(
  (selector): selector is string => Boolean(selector),
);
