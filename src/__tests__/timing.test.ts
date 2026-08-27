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

  it("skips DNS when lookup was cached or unused", () => {
    const phases = timingPhases({ ...base, dnsMs: 0, ttfbMs: 180, totalMs: 200, downloadMs: 20 });
    expect(phases.map((phase) => phase.id)).toEqual(["tls", "ttfb", "transfer", "total"]);
    expect(phases.find((phase) => phase.id === "tls")?.ms).toBe(180);
  });

  it("derives TLS and transfer from TTFB when split fields are missing", () => {
    const phases = timingPhases({ ...base, ttfbMs: 200, totalMs: 800 });
    expect(phases.find((phase) => phase.id === "tls")?.ms).toBe(200);
    expect(phases.find((phase) => phase.id === "transfer")?.ms).toBe(600);
    expect(phases.find((phase) => phase.id === "ttfb")?.ms).toBe(200);
  });

  it("keeps TLS/transfer rows when the engine reports zero", () => {
    const phases = timingPhases({
      ...base,
      dnsMs: 5,
      tlsMs: 0,
      ttfbMs: 5,
      downloadMs: 0,
      totalMs: 5,
    });
    expect(phases.find((phase) => phase.id === "tls")?.ms).toBe(0);
    expect(phases.find((phase) => phase.id === "transfer")?.ms).toBe(0);
  });

  it("treats a legacy elapsed-only payload as TTFB + total", () => {
    const phases = timingPhases(base);
    expect(phases.map((phase) => phase.id)).toEqual(["tls", "ttfb", "total"]);
    expect(phases.map((phase) => phase.ms)).toEqual([800, 800, 800]);
  });
});
