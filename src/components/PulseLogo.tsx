import { cn } from "@/lib/utils";

type PulseLogoProps = {
  className?: string;
  /** Mark only (no wordmark). */
  title?: string;
};

/** Pulse application mark — waveform through a hard frame. */
export function PulseLogo({ className, title = "Pulse" }: PulseLogoProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("size-5", className)}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      <rect
        x="2.5"
        y="2.5"
        width="27"
        height="27"
        rx="7"
        stroke="currentColor"
        strokeWidth="1.75"
        opacity="0.35"
      />
      <path
        d="M6.5 17h3.2l1.6-5.2 2.4 10.4 2.2-8.4 1.5 4.2H25.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
      <circle cx="16" cy="8.5" r="1.35" fill="currentColor" />
    </svg>
  );
}

type PulseLogoBadgeProps = {
  className?: string;
  markClassName?: string;
  title?: string;
};

/** Branded badge used in the rail, auth, and onboarding stamp. */
export function PulseLogoBadge({
  className,
  markClassName,
  title = "Pulse",
}: PulseLogoBadgeProps) {
  return (
    <div
      className={cn(
        "flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md shadow-primary/25",
        className,
      )}
      aria-hidden={title ? undefined : true}
    >
      <PulseLogo className={cn("size-4", markClassName)} title={title} />
    </div>
  );
}
