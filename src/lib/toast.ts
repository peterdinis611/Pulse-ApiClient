import { toast as sonner } from "sonner";

import type { HttpResponse } from "@/types";

function responseTimingDescription(
  response: Pick<HttpResponse, "elapsedMs" | "fromCache">,
): string {
  const cacheLabel = response.fromCache ? " · cached" : "";
  return `${response.elapsedMs} ms${cacheLabel}`;
}

export const toast = {
  success(title: string, description?: string) {
    sonner.success(title, { description });
  },
  error(title: string, description?: string) {
    sonner.error(title, { description });
  },
  info(title: string, description?: string) {
    sonner.info(title, { description });
  },
  warning(title: string, description?: string) {
    sonner.warning(title, { description });
  },
  requestResponse(response: Pick<HttpResponse, "status" | "elapsedMs" | "fromCache">) {
    const description = responseTimingDescription(response);

    if (response.status >= 200 && response.status < 300) {
      sonner.success("Request completed", { description });
    } else if (response.status >= 300 && response.status < 400) {
      sonner.info("Request redirected", { description });
    } else if (response.status >= 400 && response.status < 500) {
      sonner.error("Client error", { description });
    } else if (response.status >= 500) {
      sonner.error("Server error", { description });
    } else {
      sonner.info("Request finished", { description });
    }
  },
};
