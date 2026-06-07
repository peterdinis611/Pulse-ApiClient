import { describe, expect, it } from "vitest";
import type { FilterableItem } from "./filters";
import {
  buildOverviewItems,
  countActiveOverviewFilters,
  defaultOverviewFilter,
  filterOverviewItems,
  isOverviewFilterDefault,
  statusBucket,
  toggleOverviewMethod,
  toggleOverviewStatus,
} from "./filters";
import { createHistoryEntry, createRequest, createSavedRequest } from "./helpers";

function item(partial: Partial<FilterableItem> & Pick<FilterableItem, "id">): FilterableItem {
  return {
    title: "Untitled",
    subtitle: "https://example.com",
    method: "GET",
    meta: "meta",
    source: "history",
    onOpen: () => {},
    ...partial,
  };
}

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

  it("applies structured method and status filters", () => {
    const items = [
      item({ id: "1", method: "GET", status: 200 }),
      item({ id: "2", method: "POST", status: 500, source: "collections" }),
    ];

    const filtered = filterOverviewItems(items, {
      ...defaultOverviewFilter(),
      methods: ["POST"],
      statuses: ["5xx"],
    });

    expect(filtered.map((entry) => entry.id)).toEqual(["2"]);
  });

  it("fuzzy searches within already filtered items", () => {
    const items = [
      item({ id: "1", title: "Get users", subtitle: "https://api.example.com/users" }),
      item({ id: "2", title: "Delete user", subtitle: "https://api.example.com/users/1", method: "DELETE" }),
    ];

    const filtered = filterOverviewItems(items, {
      ...defaultOverviewFilter(),
      query: "usrs",
    });

    expect(filtered[0]?.id).toBe("1");
  });

  it("toggles method and status chips", () => {
    const base = defaultOverviewFilter();
    expect(toggleOverviewMethod(base, "GET").methods).toEqual(["GET"]);
    expect(toggleOverviewMethod({ ...base, methods: ["GET"] }, "GET").methods).toEqual([]);
    expect(toggleOverviewStatus(base, "2xx").statuses).toEqual(["2xx"]);
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
    expect(statusBucket(200)).toBe("2xx");
    expect(statusBucket(undefined)).toBe("none");

    items[0]?.onOpen();
    expect(opened).toBe("history");
  });
});
