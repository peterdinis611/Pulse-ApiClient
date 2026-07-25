import { describe, expect, it } from "vitest";
import {
  inspectCollectionImport,
  summarizeWorkspaceExport,
  workspaceExportFilename,
} from "@/lib/collection-io";

describe("collection-io", () => {
  it("detects postman collections", () => {
    const raw = JSON.stringify({
      info: { name: "Demo", schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json" },
      item: [
        { name: "A", request: { method: "GET", url: "https://example.com" } },
        {
          name: "Folder",
          item: [{ name: "B", request: { method: "POST", url: "https://example.com/b" } }],
        },
      ],
    });

    const inspection = inspectCollectionImport(raw);
    expect(inspection.format).toBe("postman");
    expect(inspection.label).toBe("Postman");
    expect(inspection.collectionCount).toBe(1);
    expect(inspection.requestCount).toBe(2);
  });

  it("detects pulse workspace exports", () => {
    const raw = JSON.stringify({
      version: 1,
      collectionGroups: [{ id: "col_1", name: "One" }],
      collections: [{ id: "req_1" }, { id: "req_2" }],
    });

    const inspection = inspectCollectionImport(raw);
    expect(inspection.format).toBe("pulse-workspace");
    expect(inspection.collectionCount).toBe(1);
    expect(inspection.requestCount).toBe(2);
  });

  it("rejects empty and unknown payloads", () => {
    expect(inspectCollectionImport("").format).toBe("unknown");
    expect(inspectCollectionImport("{ \"foo\": 1 }").format).toBe("unknown");
  });

  it("builds export filename and summary copy", () => {
    expect(workspaceExportFilename(new Date("2026-07-25T12:00:00.000Z"))).toBe(
      "pulse-collections-2026-07-25.json",
    );
    expect(summarizeWorkspaceExport(1, 1)).toBe("1 collection · 1 request");
    expect(summarizeWorkspaceExport(2, 5)).toBe("2 collections · 5 requests");
  });
});
