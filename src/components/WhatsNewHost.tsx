import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { APP_VERSION } from "@/lib/app-config";
import {
  latestRelease,
  pickCopy,
  unseenReleases,
  type ChangelogRelease,
} from "@/lib/changelog";
import { startProductTour, stopProductTour } from "@/lib/product-tour";
import {
  getLastSeenVersion,
  markVersionSeen,
  PRODUCT_TOUR_EVENT,
  shouldShowWhatsNew,
  WHATS_NEW_EVENT,
} from "@/lib/whats-new";
import { ONBOARDING_COMPLETED_EVENT, shouldShowOnboarding } from "@/lib/onboarding";
import { isScreenshotMode } from "@/lib/screenshot-demo";
import { useApp } from "@/machines";
import { useI18n } from "@/hooks/useLocale";
import { Button } from "@/components/ui/button";
import "driver.js/dist/driver.css";
import "@/styles/driver-theme.css";

function dialogReleases(force: boolean): ChangelogRelease[] {
  if (force) {
    const current = latestRelease(APP_VERSION);
    return current ? [current] : [];
  }
  const unseen = unseenReleases(getLastSeenVersion(), APP_VERSION);
  if (unseen.length) return unseen;
  const current = latestRelease(APP_VERSION);
  return current ? [current] : [];
}

export function WhatsNewHost() {
  const { setMainView, setExplorerCollapsed } = useApp();
  const { t, resolvedLocale } = useI18n();
  const [open, setOpen] = useState(false);
  const [forced, setForced] = useState(false);

  const releases = useMemo(() => (open ? dialogReleases(forced) : []), [open, forced]);

  useEffect(() => {
    if (isScreenshotMode()) return;
    const timer = window.setTimeout(() => {
      if (shouldShowOnboarding()) return;
      if (shouldShowWhatsNew()) {
        setForced(false);
        setOpen(true);
      }
    }, 520);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        markVersionSeen();
        setOpen(false);
        setForced(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    const onWhatsNew = () => {
      stopProductTour();
      setForced(true);
      setOpen(true);
    };
    const onTour = () => {
      setOpen(false);
      markVersionSeen();
      startProductTour({
        locale: resolvedLocale,
        goToView: setMainView,
        ensureExplorerOpen: () => setExplorerCollapsed(false),
      });
    };
    const onOnboardingDone = () => {
      if (!shouldShowWhatsNew()) return;
      setForced(false);
      setOpen(true);
    };
    window.addEventListener(WHATS_NEW_EVENT, onWhatsNew);
    window.addEventListener(PRODUCT_TOUR_EVENT, onTour);
    window.addEventListener(ONBOARDING_COMPLETED_EVENT, onOnboardingDone);
    return () => {
      window.removeEventListener(WHATS_NEW_EVENT, onWhatsNew);
      window.removeEventListener(PRODUCT_TOUR_EVENT, onTour);
      window.removeEventListener(ONBOARDING_COMPLETED_EVENT, onOnboardingDone);
    };
  }, [resolvedLocale, setExplorerCollapsed, setMainView]);

  useEffect(() => () => stopProductTour(), []);

  const dismiss = () => {
    markVersionSeen();
    setOpen(false);
    setForced(false);
  };

  const takeTour = () => {
    markVersionSeen();
    setOpen(false);
    setForced(false);
    window.setTimeout(() => {
      startProductTour({
        locale: resolvedLocale,
        goToView: setMainView,
        ensureExplorerOpen: () => setExplorerCollapsed(false),
      });
    }, 80);
  };

  if (!open || releases.length === 0) return null;

  return createPortal(
    <div className="whats-new-overlay">
      <button
        type="button"
        className="whats-new-overlay__scrim"
        aria-label={t("whatsNew.closeOverlay")}
        onClick={dismiss}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="whats-new-title"
        className="whats-new"
        onKeyDown={(event) => {
          if (event.key === "Escape") dismiss();
        }}
      >
        <div className="whats-new__stamp">
          <p className="whats-new__kicker">{t("whatsNew.kicker")}</p>
          <span className="whats-new__version">{APP_VERSION}</span>
        </div>
        <div className="whats-new__body">
          {releases.map((release) => (
            <section key={release.version}>
              <h2 id="whats-new-title" className="whats-new__title">
                {pickCopy(release.title, resolvedLocale)}
              </h2>
              <p className="whats-new__summary">{pickCopy(release.summary, resolvedLocale)}</p>
              <ol className="whats-new__list">
                {release.changes.map((change, index) => (
                  <li
                    key={change.id}
                    className="whats-new__item"
                    style={{ animationDelay: `${80 + index * 45}ms` }}
                  >
                    <span className="whats-new__n" aria-hidden>
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <p className="whats-new__item-title">{pickCopy(change.title, resolvedLocale)}</p>
                      <p className="whats-new__item-detail">
                        {pickCopy(change.detail, resolvedLocale)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
        <div className="whats-new__actions">
          <Button type="button" variant="ghost" onClick={dismiss}>
            {t("whatsNew.dismiss")}
          </Button>
          <Button type="button" onClick={takeTour}>
            {t("whatsNew.takeTour")}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
