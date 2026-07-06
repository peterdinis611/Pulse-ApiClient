import { toast as sonner } from "sonner";

import type { HttpResponse } from "@/types";

const TOAST_OPTIONS = {
  duration: 3500,
} as const;

export const toast = {
  success(title: string, description?: string) {
    sonner.success(title, { description, ...TOAST_OPTIONS });
  },
  error(title: string, description?: string) {
    sonner.error(title, { description, ...TOAST_OPTIONS });
  },
  info(title: string, description?: string) {
    sonner.info(title, { description, ...TOAST_OPTIONS });
  },
  warning(title: string, description?: string) {
    sonner.warning(title, { description, ...TOAST_OPTIONS });
  },
  /** @deprecated HTTP responses are shown in the response panel and status bar instead of toasts. */
  requestResponse(_response: Pick<HttpResponse, "status" | "elapsedMs" | "fromCache">) {
    // Intentionally no-op: status is visible in ResponsePanel + StatusBar.
  },
};
