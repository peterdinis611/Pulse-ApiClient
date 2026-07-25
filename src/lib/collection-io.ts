import { isBrunoCollection } from "./bruno-import";
import { isInsomniaExport } from "./insomnia-import";
import { isOpenApiSpec } from "./openapi-import";
import { isPostmanCollection } from "./postman-import";
import { isPulseCollection } from "./pulse-collection";

export type CollectionImportFormat =
  | "openapi"
  | "insomnia"
  | "postman"
  | "bruno"
  | "pulse"
  | "pulse-workspace"
  | "request-list"
  | "unknown";

export type CollectionImportInspection = {
  format: CollectionImportFormat;
  label: string;
  collectionCount: number;
  requestCount: number;
};

const FORMAT_LABELS: Record<CollectionImportFormat, string> = {
  openapi: "OpenAPI",
  insomnia: "Insomnia",
  postman: "Postman",
  bruno: "Bruno",
  pulse: "Pulse collection",
  "pulse-workspace": "Pulse workspace",
  "request-list": "Request list",
  unknown: "Unknown",
};

export function collectionImportFormatLabel(format: CollectionImportFormat): string {
  return FORMAT_LABELS[format];
}

function countArrayLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function countNestedItems(items: unknown): number {
  if (!Array.isArray(items)) return 0;
  let total = 0;
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    if (Array.isArray(record.item)) {
      total += countNestedItems(record.item);
    } else if (Array.isArray(record.items)) {
      total += countNestedItems(record.items);
    } else if (record.request || record.method || record.url) {
      total += 1;
    } else if (record.type === "http" || record.type === "graphql") {
      total += 1;
    }
  }
  return total;
}

/** Detect format + rough counts before applying an import (for toasts / UI). */
export function inspectCollectionImport(raw: string): CollectionImportInspection {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { format: "unknown", label: FORMAT_LABELS.unknown, collectionCount: 0, requestCount: 0 };
  }

  if (isOpenApiSpec(trimmed)) {
    let requestCount = 0;
    try {
      const parsed = JSON.parse(trimmed) as { paths?: Record<string, unknown> };
      for (const pathItem of Object.values(parsed.paths ?? {})) {
        if (!pathItem || typeof pathItem !== "object") continue;
        requestCount += Object.keys(pathItem).filter((key) =>
          ["get", "post", "put", "patch", "delete", "head", "options", "query"].includes(key),
        ).length;
      }
    } catch {
      requestCount = 0;
    }
    return {
      format: "openapi",
      label: FORMAT_LABELS.openapi,
      collectionCount: 1,
      requestCount,
    };
  }

  if (isInsomniaExport(trimmed)) {
    try {
      const parsed = JSON.parse(trimmed) as { resources?: Array<{ _type?: string }> };
      const resources = parsed.resources ?? [];
      const requestCount = resources.filter((item) => item._type === "request").length;
      const collectionCount = Math.max(
        1,
        resources.filter((item) => item._type === "request_group").length,
      );
      return {
        format: "insomnia",
        label: FORMAT_LABELS.insomnia,
        collectionCount,
        requestCount,
      };
    } catch {
      return { format: "insomnia", label: FORMAT_LABELS.insomnia, collectionCount: 1, requestCount: 0 };
    }
  }

  if (isPostmanCollection(trimmed)) {
    try {
      const parsed = JSON.parse(trimmed) as { item?: unknown };
      return {
        format: "postman",
        label: FORMAT_LABELS.postman,
        collectionCount: 1,
        requestCount: countNestedItems(parsed.item),
      };
    } catch {
      return { format: "postman", label: FORMAT_LABELS.postman, collectionCount: 1, requestCount: 0 };
    }
  }

  if (isBrunoCollection(trimmed)) {
    try {
      const parsed = JSON.parse(trimmed) as { items?: unknown };
      return {
        format: "bruno",
        label: FORMAT_LABELS.bruno,
        collectionCount: 1,
        requestCount: countNestedItems(parsed.items),
      };
    } catch {
      return { format: "bruno", label: FORMAT_LABELS.bruno, collectionCount: 1, requestCount: 0 };
    }
  }

  if (isPulseCollection(trimmed)) {
    try {
      const parsed = JSON.parse(trimmed) as { item?: unknown };
      return {
        format: "pulse",
        label: FORMAT_LABELS.pulse,
        collectionCount: 1,
        requestCount: countNestedItems(parsed.item),
      };
    } catch {
      return { format: "pulse", label: FORMAT_LABELS.pulse, collectionCount: 1, requestCount: 0 };
    }
  }

  try {
    const parsed = JSON.parse(trimmed) as
      | { collectionGroups?: unknown[]; collections?: unknown[] }
      | unknown[];

    if (Array.isArray(parsed)) {
      return {
        format: "request-list",
        label: FORMAT_LABELS["request-list"],
        collectionCount: 0,
        requestCount: parsed.length,
      };
    }

    const groups = countArrayLength(parsed.collectionGroups);
    const requests = countArrayLength(parsed.collections);
    if (groups > 0 || requests > 0) {
      return {
        format: "pulse-workspace",
        label: FORMAT_LABELS["pulse-workspace"],
        collectionCount: groups,
        requestCount: requests,
      };
    }
  } catch {
    // fall through
  }

  return { format: "unknown", label: FORMAT_LABELS.unknown, collectionCount: 0, requestCount: 0 };
}

export function workspaceExportFilename(date = new Date()): string {
  const stamp = date.toISOString().slice(0, 10);
  return `pulse-collections-${stamp}.json`;
}

export function summarizeWorkspaceExport(collectionCount: number, requestCount: number): string {
  const collectionsLabel = collectionCount === 1 ? "1 collection" : `${collectionCount} collections`;
  const requestsLabel = requestCount === 1 ? "1 request" : `${requestCount} requests`;
  return `${collectionsLabel} · ${requestsLabel}`;
}
