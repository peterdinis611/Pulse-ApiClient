import { useEffect, useMemo, useState } from "react";
import type { HttpResponse } from "@/types";
import {
  decodeResponseBytes,
  detectPreviewKind,
  responseMimeType,
  type ResponsePreviewKind,
} from "@/lib/response-body";
import { parseSpreadsheetPreview } from "@/lib/spreadsheet-preview";
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
  const sheet = useMemo(() => parseSpreadsheetPreview(bytes, mime), [bytes, mime]);

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
