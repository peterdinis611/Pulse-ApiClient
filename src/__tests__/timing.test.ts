import { describe, expect, it } from "vitest";
import { timingPhases, responseTotalMs } from "@/lib/timing";
import type { HttpResponse } from "@/types";

const base: HttpResponse = {
  status: 200,
  statusText: "OK",
  headers: [],
  body: "{}",
  elapsedMs: 800,
  sizeBytes: 2,
};

describe("timing", () => {
  it("falls back to elapsedMs for total", () => {
    expect(responseTotalMs(base)).toBe(800);
    expect(responseTotalMs({ ...base, totalMs: 640 })).toBe(640);
  });

  it("builds DNS / TLS / TTFB / transfer / total phases", () => {
    const phases = timingPhases({
      ...base,
      dnsMs: 12,
      tlsMs: 48,
      ttfbMs: 180,
      downloadMs: 620,
      totalMs: 800,
      elapsedMs: 800,
    });
    expect(phases.map((phase) => phase.id)).toEqual(["dns", "tls", "ttfb", "transfer", "total"]);
    expect(phases.find((phase) => phase.id === "dns")?.ms).toBe(12);
    expect(phases.find((phase) => phase.id === "tls")?.offsetMs).toBe(12);
    expect(phases.find((phase) => phase.id === "transfer")?.offsetMs).toBe(180);
    expect(phases.find((phase) => phase.id === "total")?.ms).toBe(800);
  });
});
