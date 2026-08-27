export type RunnerDataRow = Record<string, string>;

export type ParsedRunnerData = {
  rows: RunnerDataRow[];
  fileName: string;
};

const MAX_DATA_ROWS = 10_000;

export function parseRunnerDataFile(text: string, fileName: string): ParsedRunnerData {
  const trimmed = text.replace(/^\uFEFF/, "").trim();
  if (!trimmed) {
    throw new Error("Data file is empty");
  }

  const lower = fileName.toLowerCase();
  const rows = lower.endsWith(".json") || trimmed.startsWith("[") || trimmed.startsWith("{")
    ? parseJsonData(trimmed)
    : parseCsvData(trimmed);

  if (rows.length === 0) {
    throw new Error("Data file has no iterations");
  }
  if (rows.length > MAX_DATA_ROWS) {
    throw new Error(`Data file has more than ${MAX_DATA_ROWS} rows`);
  }

  return { rows, fileName };
}

function objectToRow(value: unknown): RunnerDataRow {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { value: stringifyCell(value) };
  }
  const row: RunnerDataRow = {};
  for (const [key, cell] of Object.entries(value as Record<string, unknown>)) {
    const name = key.trim();
    if (!name) continue;
    row[name] = stringifyCell(cell);
  }
  return row;
}

function stringifyCell(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function parseJsonData(text: string): RunnerDataRow[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Data file is not valid JSON");
  }

  if (Array.isArray(parsed)) {
    return parsed.map(objectToRow);
  }
  if (parsed && typeof parsed === "object") {
    return [objectToRow(parsed)];
  }
  throw new Error("JSON data file must be an array of objects (or one object)");
}

function parseCsvData(text: string): RunnerDataRow[] {
  const table = parseCsv(text);
  const header = table[0];
  if (!header || header.every((cell) => !cell.trim())) {
    throw new Error("CSV data file needs a header row");
  }
  const keys = header.map((cell, index) => cell.trim() || `col_${index + 1}`);
  return table.slice(1).map((cells) => {
    const row: RunnerDataRow = {};
    keys.forEach((key, index) => {
      row[key] = cells[index] ?? "";
    });
    return row;
  }).filter((row) => Object.values(row).some((value) => value.trim() !== ""));
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  const pushCell = () => {
    row.push(cell);
    cell = "";
  };
  const pushRow = () => {
    pushCell();
    rows.push(row);
    row = [];
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === ",") {
      pushCell();
      continue;
    }
    if (char === "\n") {
      pushRow();
      continue;
    }
    if (char === "\r") {
      continue;
    }
    cell += char;
  }
  if (quoted) {
    throw new Error("CSV data file has an unclosed quote");
  }
  if (cell.length > 0 || row.length > 0) {
    pushRow();
  }
  return rows;
}

export async function pickRunnerDataFile(): Promise<{ name: string; text: string } | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv,.json,text/csv,application/json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      resolve({ name: file.name, text: await file.text() });
    };
    input.click();
  });
}
