import * as XLSX from "xlsx";

export type SpreadsheetPreview = {
  error: string | null;
  rows: string[][];
  name: string;
};

const MAX_ROWS = 200;
const MAX_COLS = 40;

/** Parse CSV/XLSX bytes into a capped table for the response preview. */
export function parseSpreadsheetPreview(bytes: Uint8Array, mime: string): SpreadsheetPreview {
  try {
    const isCsv = mime.includes("csv") || mime === "text/csv";
    const workbook = isCsv
      ? XLSX.read(new TextDecoder().decode(bytes), { type: "string" })
      : XLSX.read(bytes, { type: "array" });
    const firstName = workbook.SheetNames[0];
    if (!firstName) {
      return { error: "Workbook has no sheets.", rows: [], name: "" };
    }
    const worksheet = workbook.Sheets[firstName];
    if (!worksheet) {
      return { error: "Could not read first sheet.", rows: [], name: firstName };
    }
    const rows = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(worksheet, {
      header: 1,
      defval: "",
      raw: false,
    });
    const limited = rows.slice(0, MAX_ROWS).map((row) =>
      (Array.isArray(row) ? row : []).slice(0, MAX_COLS).map((cell) => String(cell ?? "")),
    );
    return { error: null, rows: limited, name: firstName };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to parse spreadsheet.",
      rows: [],
      name: "",
    };
  }
}
