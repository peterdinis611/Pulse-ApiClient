import { describe, expect, it } from "vitest";
import {
  buildOverviewItems,
  countActiveOverviewFilters,
  defaultOverviewFilter,
  filterHistoryEntries,
  filterOverviewItems,
  filterSavedRequests,
  isOverviewFilterDefault,
  overviewFilterLabels,
  removeOverviewMethod,
  removeOverviewSource,
  removeOverviewStatus,
  statusBucket,
  toggleOverviewMethod,
  toggleOverviewSource,
  toggleOverviewStatus,
} from "../filters";
import { createHistoryEntry, createRequest, createSavedRequest } from "../helpers";
import { makeFilterableItem } from "./test-fixtures";

describe("filters", () => {
  it("detects active filters", () => {
    expect(isOverviewFilterDefault(defaultOverviewFilter())).toBe(true);
    expect(
      countActiveOverviewFilters({
        ...defaultOverviewFilter(),
        query: "users",
        methods: ["GET"],
      }),
    ).toBe(2);
  });

  it.each([
    [200, "2xx"],
    [301, "3xx"],
    [404, "4xx"],
    [500, "5xx"],
    [undefined, "none"],
    [199, "none"],
  ] as const)("statusBucket(%s) → %s", (status, expected) => {
    expect(statusBucket(status)).toBe(expected);
  });

  it("applies structured method and status filters", () => {
    const items = [
      makeFilterableItem({ id: "1", method: "GET", status: 200 }),
      makeFilterableItem({ id: "2", method: "POST", status: 500, source: "collections" }),
    ];

    const filtered = filterOverviewItems(items, {
      ...defaultOverviewFilter(),
      methods: ["POST"],
      statuses: ["5xx"],
    });

    expect(filtered.map((entry) => entry.id)).toEqual(["2"]);
  });

  it("filters by source", () => {
    const items = [
      makeFilterableItem({ id: "1", source: "history" }),
      makeFilterableItem({ id: "2", source: "collections" }),
    ];

    const filtered = filterOverviewItems(items, {
      ...defaultOverviewFilter(),
      sources: ["collections"],
    });

    expect(filtered.map((entry) => entry.id)).toEqual(["2"]);
  });

  it("fuzzy searches within already filtered items", () => {
    const items = [
      makeFilterableItem({ id: "1", title: "Get users", subtitle: "https://api.example.com/users" }),
      makeFilterableItem({
        id: "2",
        title: "Delete user",
        subtitle: "https://api.example.com/users/1",
        method: "DELETE",
      }),
    ];

    const filtered = filterOverviewItems(items, {
      ...defaultOverviewFilter(),
      query: "usrs",
    });

    expect(filtered[0]?.id).toBe("1");
  });

  it("toggles and removes filter chips", () => {
    const base = defaultOverviewFilter();
    const withGet = { ...base, methods: ["GET"] as const, sources: ["history"] as const, statuses: ["2xx"] as const };

    expect(toggleOverviewMethod(base, "GET").methods).toEqual(["GET"]);
    expect(toggleOverviewMethod(withGet, "GET").methods).toEqual([]);
    expect(toggleOverviewStatus(base, "2xx").statuses).toEqual(["2xx"]);
    expect(toggleOverviewSource(base, "history").sources).toEqual(["history"]);
    expect(toggleOverviewSource({ ...base, sources: ["history"] }, "history").sources).toEqual([]);

    expect(removeOverviewMethod(withGet, "GET").methods).toEqual([]);
    expect(removeOverviewSource(withGet, "history").sources).toEqual([]);
    expect(removeOverviewStatus(withGet, "2xx").statuses).toEqual([]);
  });

  it("builds human-readable filter labels", () => {
    const labels = overviewFilterLabels({
      ...defaultOverviewFilter(),
      query: "  users ",
      methods: ["GET"],
      sources: ["history", "collections"],
      statuses: ["2xx", "none"],
    });

    expect(labels).toEqual([
      "Search: users",
      "GET",
      "History",
      "Collections",
      "2xx",
      "No response",
    ]);
  });

  it("maps overview items from history and collections", () => {
    const request = createRequest({ name: "Fetch data", url: "https://example.com/data" });
    const saved = createSavedRequest(request, { name: "Saved fetch", folder: "Main" });
    const history = createHistoryEntry(request, { status: 200, elapsedMs: 42, sizeBytes: 10 });

    let opened: string | null = null;
    const items = buildOverviewItems([history], [saved], {
      onHistory: () => {
        opened = "history";
      },
      onSaved: () => {
        opened = "saved";
      },
    });

    expect(items).toHaveLength(2);
    items[0]?.onOpen();
    expect(opened).toBe("history");
  });

  it("filters saved requests and history entries by fuzzy query", () => {
    const request = createRequest({ name: "Get users", url: "https://api.example.com/users" });
    const saved = [
      createSavedRequest(request, { name: "Get users" }),
      createSavedRequest(createRequest({ name: "Delete user", url: "https://api.example.com/users/1", method: "DELETE" })),
    ];
    const history = [
      createHistoryEntry(request, { status: 200, elapsedMs: 10, sizeBytes: 5 }),
      createHistoryEntry(
        createRequest({ name: "Health", url: "https://api.example.com/health" }),
        { status: 200, elapsedMs: 5, sizeBytes: 2 },
      ),
    ];

    const ranked = filterSavedRequests(saved, "usrs");
    expect(ranked[0]?.name).toBe("Get users");
    expect(filterHistoryEntries(history, "health")[0]?.request.name).toBe("Health");
    expect(filterSavedRequests(saved, "")).toHaveLength(2);
    expect(filterHistoryEntries(history, "  ")).toHaveLength(2);
  });
});
