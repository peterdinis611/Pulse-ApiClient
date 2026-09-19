import { APP_VERSION } from "@/lib/app-config";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import "@/styles/preload.css";

type LoadingScreenProps = {
  variant?: "fullscreen" | "inline";
  label?: string;
  className?: string;
};

export function LoadingScreen({
  variant = "fullscreen",
  label = "Loading",
  className,
}: LoadingScreenProps) {
  const isFullscreen = variant === "fullscreen";

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      className={cn("pulse-boot", isFullscreen ? "pulse-boot--full" : "pulse-boot--inline", className)}
    >
      <div className="pulse-boot__grain" aria-hidden />
      <div className="pulse-boot__scan" aria-hidden />
      <div className="pulse-boot__card">
        <div className="pulse-boot__meta">
          <p className="pulse-boot__kicker">{t("loading.kicker")}</p>
          <p className="pulse-boot__clock">{APP_VERSION}</p>
        </div>
        <p className="pulse-boot__title" aria-hidden>
          <span>P</span>
          <span>U</span>
          <span>L</span>
          <span>S</span>
          <span>E</span>
        </p>
        <p className="pulse-boot__line">
          <span className="pulse-boot__method">{t("loading.method")}</span>
          <span className="pulse-boot__path">{t("loading.path")}</span>
          <span className="pulse-boot__cursor" aria-hidden />
        </p>
        <div className="pulse-boot__rail" aria-hidden>
          <i />
          <i />
          <i />
          <i />
        </div>
        <ol className="pulse-boot__ticks" aria-hidden>
          <li>DNS</li>
          <li>TLS</li>
          <li>TTFB</li>
          <li>BODY</li>
        </ol>
        <p className="pulse-boot__label">{label}</p>
      </div>
    </div>
  );
}
