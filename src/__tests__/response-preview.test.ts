import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { collectionExportFilename, createDownloadBlob } from "@/lib/download";
import { parseSpreadsheetPreview } from "@/lib/spreadsheet-preview";

describe("spreadsheet-preview", () => {
  it("parses CSV into rows", () => {
    const csv = "name,age\nAda,36\nGrace,45\n";
    const bytes = new TextEncoder().encode(csv);
    const preview = parseSpreadsheetPreview(bytes, "text/csv");

    expect(preview.error).toBeNull();
    expect(preview.name).toBeTruthy();
    expect(preview.rows[0]).toEqual(["name", "age"]);
    expect(preview.rows[1]).toEqual(["Ada", "36"]);
    expect(preview.rows[2]).toEqual(["Grace", "45"]);
  });

  it("parses xlsx workbook bytes", () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ["sku", "qty"],
      ["A-1", 2],
      ["B-2", 5],
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, "Inventory");
    const bytes = new Uint8Array(XLSX.write(workbook, { type: "array", bookType: "xlsx" }));

    const preview = parseSpreadsheetPreview(
      bytes,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );

    expect(preview.error).toBeNull();
    expect(preview.name).toBe("Inventory");
    expect(preview.rows[0]).toEqual(["sku", "qty"]);
    expect(preview.rows[1]?.[0]).toBe("A-1");
    expect(preview.rows[2]?.[0]).toBe("B-2");
  });

  it("caps very wide CSV rows", () => {
    const header = Array.from({ length: 50 }, (_, index) => `c${index}`).join(",");
    const row = Array.from({ length: 50 }, (_, index) => String(index)).join(",");
    const bytes = new TextEncoder().encode(`${header}\n${row}\n`);
    const preview = parseSpreadsheetPreview(bytes, "text/csv");

    expect(preview.error).toBeNull();
    expect(preview.rows[0]?.length).toBe(40);
    expect(preview.rows[1]?.length).toBe(40);
  });

  it("caps very tall CSV sheets", () => {
    const lines = ["n", ...Array.from({ length: 250 }, (_, index) => String(index))];
    const bytes = new TextEncoder().encode(`${lines.join("\n")}\n`);
    const preview = parseSpreadsheetPreview(bytes, "text/csv");

    expect(preview.error).toBeNull();
    expect(preview.rows.length).toBe(200);
  });

  it("reads single-column CSV", () => {
    const bytes = new TextEncoder().encode("value\n42\n");
    const preview = parseSpreadsheetPreview(bytes, "application/csv");
    expect(preview.error).toBeNull();
    expect(preview.rows).toEqual([["value"], ["42"]]);
  });
});

describe("download helpers", () => {
  it("createDownloadBlob sets mime type", () => {
    const jsonBlob = createDownloadBlob('{"ok":true}', "application/json");
    expect(jsonBlob).toBeInstanceOf(Blob);
    expect(jsonBlob.type.startsWith("application/json")).toBe(true);

    const pngBlob = createDownloadBlob(new Uint8Array([1, 2, 3]), "image/png");
    expect(pngBlob.type).toBe("image/png");
    expect(pngBlob.size).toBe(3);
  });

  it("collectionExportFilename slugifies names", () => {
    expect(collectionExportFilename("My API!", "json")).toBe("my-api.json");
    expect(collectionExportFilename("   ", "json")).toBe("collection.json");
  });
});
