import { createCollectionGroup } from "./collections";
import { createRequest, createSavedRequest } from "./helpers";
import type { ApiRequest, CollectionGroup, HttpMethod, SavedRequest } from "@/types";

const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete", "head", "options", "query"]);

type OpenApiSpec = {
  openapi?: string;
  swagger?: string;
  info?: { title?: string };
  servers?: Array<{ url?: string }>;
  paths?: Record<string, Record<string, OpenApiOperation>>;
};

type OpenApiOperation = {
  summary?: string;
  operationId?: string;
  parameters?: Array<{
    name?: string;
    in?: string;
    required?: boolean;
    schema?: { default?: unknown };
  }>;
  requestBody?: {
    content?: Record<string, { example?: unknown; schema?: { example?: unknown } }>;
  };
};

export function isOpenApiSpec(raw: string): boolean {
  try {
    const parsed = JSON.parse(raw) as OpenApiSpec;
    return Boolean(parsed.openapi || parsed.swagger) && Boolean(parsed.paths);
  } catch {
    return false;
  }
}

function resolveServerBase(spec: OpenApiSpec): string {
  const server = spec.servers?.[0]?.url?.trim();
  if (!server) return "";
  return server.replace(/\/$/, "");
}

function buildUrl(base: string, path: string, operation: OpenApiOperation): string {
  const query = (operation.parameters ?? [])
    .filter((param) => param.in === "query" && param.name)
    .map((param) => `${param.name}=${encodeURIComponent(String(param.schema?.default ?? ""))}`)
    .join("&");

  const joined = `${base}${path}`.replace(/([^:]\/)\/+/g, "$1");
  return query ? `${joined}?${query}` : joined;
}

function exampleBody(operation: OpenApiOperation): { bodyKind: ApiRequest["bodyKind"]; body: string } {
  const jsonContent = operation.requestBody?.content?.["application/json"];
  const example = jsonContent?.example ?? jsonContent?.schema?.example;
  if (example == null) {
    return { bodyKind: "none", body: "" };
  }
  return {
    bodyKind: "json",
    body: JSON.stringify(example, null, 2),
  };
}

export function importOpenApiCollection(raw: string): {
  collection: CollectionGroup;
  requests: SavedRequest[];
} {
  const spec = JSON.parse(raw) as OpenApiSpec;
  if (!spec.paths) {
    throw new Error("OpenAPI spec is missing paths");
  }

  const title = spec.info?.title?.trim() || "OpenAPI Collection";
  const collection = createCollectionGroup(title);
  collection.source = "pulse";

  const base = resolveServerBase(spec);
  const requests: SavedRequest[] = [];

  for (const [path, methods] of Object.entries(spec.paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      if (!HTTP_METHODS.has(method.toLowerCase())) continue;
      const op = operation as OpenApiOperation;
      const name = op.summary?.trim() || op.operationId?.trim() || `${method.toUpperCase()} ${path}`;
      const { bodyKind, body } = exampleBody(op);
      const request = createRequest({
        name,
        method: method.toUpperCase() as HttpMethod,
        url: buildUrl(base, path, op),
        bodyKind,
        body: body || '{\n  \n}',
      });

      requests.push(
        createSavedRequest(request, {
          collectionId: collection.id,
          name,
        }),
      );
    }
  }

  if (requests.length === 0) {
    throw new Error("No HTTP operations found in OpenAPI spec");
  }

  collection.folders = [];
  return { collection, requests };
}

export function importOpenApiIntoState(
  raw: string,
  state: { collectionGroups: CollectionGroup[]; collections: SavedRequest[] },
) {
  const imported = importOpenApiCollection(raw);
  return {
    collectionGroups: [...state.collectionGroups, imported.collection],
    collections: [...imported.requests, ...state.collections],
    activeCollectionId: imported.collection.id,
  };
}
