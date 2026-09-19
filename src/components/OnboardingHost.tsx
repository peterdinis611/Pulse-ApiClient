import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check } from "lucide-react";
import { ThemePicker } from "@/components/ThemePicker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useI18n } from "@/hooks/useLocale";
import { useApp } from "@/machines";
import type { LocalePreference } from "@/lib/i18n";
import {
  HOME_VIEW_DEFAULT,
  type HomeView,
  loadLayoutPreferences,
  saveLayoutPreferences,
} from "@/lib/layout-preferences";
import {
  markOnboardingComplete,
  notifyOnboardingCompleted,
  ONBOARDING_EVENT,
  ONBOARDING_STEPS,
  shouldShowOnboarding,
} from "@/lib/onboarding";
import { isScreenshotMode } from "@/lib/screenshot-demo";
import { cn } from "@/lib/utils";
import { getResolvedLocale } from "@/lib/i18n";
import "@/styles/onboarding.css";

const LOCALE_OPTIONS: LocalePreference[] = ["system", "en", "sk"];

export function OnboardingHost() {
  const { theme, setTheme, setMainView, setExplorerCollapsed } = useApp();
  const { t, locale, setLocale } = useI18n();
  const [open, setOpen] = useState(false);
  const [forced, setForced] = useState(false);
  const [step, setStep] = useState(0);
  const [homeView, setHomeView] = useState<HomeView>(HOME_VIEW_DEFAULT);
  const [hideExplorer, setHideExplorer] = useState(false);

  useEffect(() => {
    if (isScreenshotMode()) return;
    const layout = loadLayoutPreferences();
    setHomeView(layout.homeView);
    setHideExplorer(layout.explorerCollapsed);
    if (shouldShowOnboarding()) {
      setForced(false);
      setOpen(true);
    }
  }, []);

  useEffect(() => {
    const onReplay = () => {
      const layout = loadLayoutPreferences();
      setHomeView(layout.homeView);
      setHideExplorer(layout.explorerCollapsed);
      setStep(0);
      setForced(true);
      setOpen(true);
    };
    window.addEventListener(ONBOARDING_EVENT, onReplay);
    return () => window.removeEventListener(ONBOARDING_EVENT, onReplay);
  }, []);

  const closeReplay = () => {
    if (!forced) return;
    setOpen(false);
    setForced(false);
    setStep(0);
  };

  const finish = () => {
    saveLayoutPreferences({ homeView, explorerCollapsed: hideExplorer });
    setMainView(homeView);
    window.setTimeout(() => setExplorerCollapsed(hideExplorer), 0);
    markOnboardingComplete();
    setOpen(false);
    setForced(false);
    setStep(0);
    if (!forced) notifyOnboardingCompleted();
  };

  if (!open) return null;

  const total = ONBOARDING_STEPS.length;
  const current = ONBOARDING_STEPS[step] ?? "language";
  const resolved = getResolvedLocale();

  return createPortal(
    <div className="onboarding-overlay">
      {forced ? (
        <button
          type="button"
          className="onboarding-overlay__scrim"
          aria-label={t("onboarding.close")}
          onClick={closeReplay}
        />
      ) : (
        <div className="onboarding-overlay__scrim" />
      )}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        className="onboarding"
      >
        <header className="onboarding__stamp">
          <p className="onboarding__kicker">{t("onboarding.kicker")}</p>
          <p className="onboarding__progress">
            {t("onboarding.step", { current: step + 1, total })}
          </p>
        </header>
        <div className="onboarding__rail" aria-hidden>
          {ONBOARDING_STEPS.map((id, index) => (
            <span
              key={id}
              className={cn(
                "onboarding__rail-dot",
                index === step && "onboarding__rail-dot--active",
                index < step && "onboarding__rail-dot--done",
              )}
            />
          ))}
        </div>
        <div className="onboarding__body">
          <h2 id="onboarding-title" className="onboarding__title">
            {t("onboarding.title")}
          </h2>
          <p className="onboarding__summary">{t("onboarding.summary")}</p>

          {current === "language" && (
            <section className="onboarding__panel">
              <h3 className="onboarding__panel-title">{t("onboarding.language.title")}</h3>
              <p className="onboarding__panel-hint">{t("onboarding.language.hint")}</p>
              <div className="onboarding__choices">
                {LOCALE_OPTIONS.map((option) => {
                  const active = locale === option;
                  const label =
                    option === "system"
                      ? t("settings.language.system")
                      : option === "en"
                        ? t("settings.language.en")
                        : t("settings.language.sk");
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setLocale(option)}
                      className={cn("onboarding__choice", active && "onboarding__choice--active")}
                    >
                      <span className="onboarding__choice-code">
                        {option === "system" ? `OS · ${resolved.toUpperCase()}` : option.toUpperCase()}
                      </span>
                      <span className="onboarding__choice-label">{label}</span>
                      {active && <Check className="onboarding__choice-check" strokeWidth={3} />}
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {current === "theme" && (
            <section className="onboarding__panel">
              <h3 className="onboarding__panel-title">{t("onboarding.theme.title")}</h3>
              <p className="onboarding__panel-hint">{t("onboarding.theme.hint")}</p>
              <ThemePicker value={theme} onChange={setTheme} />
            </section>
          )}

          {current === "workspace" && (
            <section className="onboarding__panel">
              <h3 className="onboarding__panel-title">{t("onboarding.workspace.title")}</h3>
              <p className="onboarding__panel-hint">{t("onboarding.workspace.hint")}</p>
              <div className="onboarding__choices">
                <button
                  type="button"
                  onClick={() => setHomeView("overview")}
                  className={cn(
                    "onboarding__choice onboarding__choice--wide",
                    homeView === "overview" && "onboarding__choice--active",
                  )}
                >
                  <span className="onboarding__choice-code">01</span>
                  <span className="onboarding__choice-label">{t("onboarding.home.overview")}</span>
                  <span className="onboarding__choice-hint">{t("onboarding.home.overviewHint")}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setHomeView("request")}
                  className={cn(
                    "onboarding__choice onboarding__choice--wide",
                    homeView === "request" && "onboarding__choice--active",
                  )}
                >
                  <span className="onboarding__choice-code">02</span>
                  <span className="onboarding__choice-label">{t("onboarding.home.request")}</span>
                  <span className="onboarding__choice-hint">{t("onboarding.home.requestHint")}</span>
                </button>
              </div>
              <label className="onboarding__check">
                <Checkbox
                  checked={hideExplorer}
                  onCheckedChange={(checked) => setHideExplorer(checked === true)}
                />
                <span>
                  <span className="onboarding__check-title">{t("onboarding.explorer")}</span>
                  <span className="onboarding__check-hint">{t("onboarding.explorerHint")}</span>
                </span>
              </label>
            </section>
          )}
        </div>
        <div className="onboarding__actions">
          <Button type="button" variant="ghost" disabled={step === 0} onClick={() => setStep((n) => n - 1)}>
            {t("onboarding.back")}
          </Button>
          {step < total - 1 ? (
            <Button type="button" onClick={() => setStep((n) => n + 1)}>
              {t("onboarding.next")}
            </Button>
          ) : (
            <Button type="button" onClick={finish}>
              {t("onboarding.finish")}
            </Button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
