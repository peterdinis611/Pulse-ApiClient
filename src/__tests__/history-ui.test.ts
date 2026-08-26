import { describe, expect, it } from "vitest";
import {
  collapseConsecutiveHistory,
  formatElapsedMs,
  groupHistoryByDay,
  historyDayLabel,
} from "@/lib/history-ui";
import { createHistoryEntry, createRequest } from "@/lib/helpers";

describe("history-ui", () => {
  it("labels days relative to now", () => {
    const now = new Date("2026-08-09T15:00:00");
    expect(historyDayLabel("2026-08-09T10:00:00", now)).toBe("Today");
    expect(historyDayLabel("2026-08-08T10:00:00", now)).toBe("Yesterday");
    expect(historyDayLabel("2026-08-05T10:00:00", now)).toBe("This week");
    expect(historyDayLabel("2026-07-20T10:00:00", now)).toBe("This month");
    expect(historyDayLabel("2026-06-01T10:00:00", now)).toBe("Older");
  });

  it("groups history by day label order", () => {
    const now = new Date("2026-08-09T15:00:00");
    const req = createRequest({ method: "GET", url: "https://a.test/x" });
    const entries = [
      { ...createHistoryEntry(req), sentAt: "2026-07-01T10:00:00.000Z" },
      { ...createHistoryEntry(req), sentAt: "2026-08-09T10:00:00.000Z" },
      { ...createHistoryEntry(req), sentAt: "2026-08-08T10:00:00.000Z" },
    ];
    const groups = groupHistoryByDay(entries, now);
    expect(groups.map((g) => g.label)).toEqual(["Today", "Yesterday", "Older"]);
  });

  it("collapses consecutive identical requests", () => {
    const a = createHistoryEntry(createRequest({ method: "GET", url: "https://a.test/x", name: "usertasks" }));
    const b = createHistoryEntry(createRequest({ method: "GET", url: "https://a.test/x", name: "usertasks" }));
    const c = createHistoryEntry(createRequest({ method: "POST", url: "https://a.test/y", name: "message" }));
    const d = createHistoryEntry(createRequest({ method: "GET", url: "https://a.test/x", name: "usertasks" }));

    const clusters = collapseConsecutiveHistory([a, b, c, d]);
    expect(clusters).toHaveLength(3);
    expect(clusters[0]!.entries).toHaveLength(2);
    expect(clusters[1]!.entries).toHaveLength(1);
    expect(clusters[2]!.entries).toHaveLength(1);
  });

  it("formats elapsed durations", () => {
    expect(formatElapsedMs(0)).toBe("—");
    expect(formatElapsedMs(215)).toBe("215ms");
    expect(formatElapsedMs(2100)).toBe("2.1s");
    expect(formatElapsedMs(12500)).toBe("13s");
  });
});
