import type { HttpResponse } from "@/types";

export type TimingPhase = {
  id: "dns" | "tls" | "ttfb" | "transfer" | "total";
  label: string;
  hint: string;
  ms: number;
  offsetMs: number;
};

export function responseTotalMs(response: Pick<HttpResponse, "elapsedMs" | "totalMs">): number {
  return response.totalMs ?? response.elapsedMs;
}

export function timingPhases(response: HttpResponse): TimingPhase[] {
  const ttfb = response.ttfbMs ?? response.elapsedMs;
  const total = responseTotalMs(response);
  const dns = response.dnsMs ?? 0;
  const tls = response.tlsMs ?? Math.max(0, ttfb - dns);
  const transfer = response.downloadMs ?? Math.max(0, total - ttfb);

  const phases: TimingPhase[] = [];
  if ((response.dnsMs ?? 0) > 0) {
    phases.push({
      id: "dns",
      label: "DNS",
      hint: "Hostname lookup for this request",
      ms: dns,
      offsetMs: 0,
    });
  }
  if (tls > 0 || response.tlsMs != null) {
    phases.push({
      id: "tls",
      label: "TLS",
      hint: "TCP, TLS handshake, and wait until first byte (after DNS)",
      ms: tls,
      offsetMs: dns,
    });
  }
  phases.push({
    id: "ttfb",
    label: "TTFB",
    hint: "Time until response headers",
    ms: ttfb,
    offsetMs: 0,
  });
  if (transfer > 0 || response.downloadMs != null) {
    phases.push({
      id: "transfer",
      label: "Transfer",
      hint: "Time to download the body after headers",
      ms: transfer,
      offsetMs: ttfb,
    });
  }
  phases.push({
    id: "total",
    label: "Total",
    hint: "Wall-clock time including body",
    ms: total,
    offsetMs: 0,
  });
  return phases;
}
