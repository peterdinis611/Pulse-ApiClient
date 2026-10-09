import { useEffect, useState, type ReactNode } from "react";

type DeferredFallbackProps = {
  /** Wait this long before painting the fallback — skips flash on fast/cached loads. */
  delayMs?: number;
  children: ReactNode;
};

/**
 * Suspense fallback that stays invisible briefly so rail switches don't flash
 * a full LoadingScreen when the chunk is already warm or resolves quickly.
 */
export function DeferredFallback({ delayMs = 200, children }: DeferredFallbackProps) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setShow(true), delayMs);
    return () => window.clearTimeout(id);
  }, [delayMs]);

  if (!show) {
    return <div className="min-h-0 flex-1" aria-hidden />;
  }

  return children;
}
