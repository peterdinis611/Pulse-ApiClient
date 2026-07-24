import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import type { HttpResponse } from "@/types";
import {
  decodeResponseBytes,
  detectPreviewKind,
  responseMimeType,
  type ResponsePreviewKind,
} from "@/lib/response-body";
import { cn } from "@/lib/utils";

type ResponseMediaPreviewProps = {
  response: HttpResponse;
  kind: ResponsePreviewKind;
};

function useObjectUrl(bytes: Uint8Array, mime: string): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const objectUrl = URL.createObjectURL(new Blob([copy], { type: mime }));
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [bytes, mime]);

  return url;
}

function ExcelPreview({ bytes, mime }: { bytes: Uint8Array; mime: string }) {
  const sheet = useMemo(() => {
    try {
      const isCsv = mime.includes("csv") || mime === "text/csv";
      const workbook = isCsv
        ? XLSX.read(new TextDecoder().decode(bytes), { type: "string" })
        : XLSX.read(bytes, { type: "array" });
      const firstName = workbook.SheetNames[0];
      if (!firstName) return { error: "Workbook has no sheets.", rows: [] as string[][], name: "" };
      const worksheet = workbook.Sheets[firstName];
      if (!worksheet) return { error: "Could not read first sheet.", rows: [] as string[][], name: firstName };
      const rows = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(worksheet, {
        header: 1,
        defval: "",
        raw: false,
      });
      const limited = rows.slice(0, 200).map((row) =>
        (Array.isArray(row) ? row : []).slice(0, 40).map((cell) => String(cell ?? "")),
      );
      return { error: null as string | null, rows: limited, name: firstName };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Failed to parse spreadsheet.",
        rows: [] as string[][],
        name: "",
      };
    }
  }, [bytes, mime]);

  if (sheet.error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        {sheet.error}
      </div>
    );
  }

  if (!sheet.rows.length) {
    return <p className="text-sm text-muted-foreground">Sheet is empty.</p>;
  }

  const columnCount = Math.max(...sheet.rows.map((row) => row.length), 1);

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Sheet <span className="font-medium text-foreground">{sheet.name}</span>
        {sheet.rows.length >= 200 ? " · showing first 200 rows" : null}
      </p>
      <div className="overflow-auto rounded-lg border border-border/70">
        <table className="min-w-full border-collapse text-left font-mono text-[11px]">
          <tbody>
            {sheet.rows.map((row, rowIndex) => (
              <tr
                key={`row-${rowIndex}`}
                className={cn(
                  "border-b border-border/50",
                  rowIndex === 0 && "bg-muted/40 font-semibold text-foreground",
                )}
              >
                {Array.from({ length: columnCount }, (_, colIndex) => (
                  <td
                    key={`cell-${rowIndex}-${colIndex}`}
                    className="max-w-[220px] truncate whitespace-nowrap border-r border-border/40 px-2 py-1.5 last:border-r-0"
                    title={row[colIndex] ?? ""}
                  >
                    {row[colIndex] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ResponseMediaPreview({ response, kind }: ResponseMediaPreviewProps) {
  const bytes = useMemo(() => decodeResponseBytes(response), [response]);
  const mime = responseMimeType(response.contentType, kind);
  const objectUrl = useObjectUrl(bytes, mime);

  if (kind === "image") {
    return (
      <div className="flex min-h-[200px] items-center justify-center rounded-lg border border-border/70 bg-muted/20 p-4">
        {objectUrl ? (
          <img
            src={objectUrl}
            alt="Response preview"
            className="max-h-[min(70vh,640px)] max-w-full object-contain"
          />
        ) : (
          <p className="text-sm text-muted-foreground">Loading image…</p>
        )}
      </div>
    );
  }

  if (kind === "pdf") {
    return (
      <div className="overflow-hidden rounded-lg border border-border/70 bg-muted/10">
        {objectUrl ? (
          <iframe title="PDF preview" src={objectUrl} className="h-[min(70vh,720px)] w-full bg-background" />
        ) : (
          <p className="p-4 text-sm text-muted-foreground">Loading PDF…</p>
        )}
      </div>
    );
  }

  if (kind === "excel") {
    return <ExcelPreview bytes={bytes} mime={mime} />;
  }

  return (
    <div className="rounded-lg border border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">
      Binary response ({bytes.byteLength.toLocaleString()} bytes). Use Download or Raw to inspect.
    </div>
  );
}

export function previewKindForResponse(response: HttpResponse): ResponsePreviewKind {
  return detectPreviewKind(response.contentType, response.bodyEncoding);
}
