import { createCollectionGroup } from "./collections";
import { createId, createRequest, createSavedRequest } from "./helpers";
import { snapshotResponseExample } from "./request-examples";
import type { ApiRequest, CollectionGroup, HttpMethod, HttpResponse, SavedRequest } from "@/types";

const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete", "head", "options", "query"]);

type OpenApiMedia = {
  example?: unknown;
  examples?: Record<string, { value?: unknown; summary?: string }>;
  schema?: { example?: unknown };
};

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
    content?: Record<string, OpenApiMedia>;
  };
  responses?: Record<
    string,
    { description?: string; content?: Record<string, OpenApiMedia> }
  >;
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

function responseSchema(operation: OpenApiOperation): string {
  const responses = operation.responses ?? {};
  const preferred =
    responses["200"] ?? responses["201"] ?? Object.values(responses).find((item) => item?.content);
  const schema = preferred?.content?.["application/json"]?.schema;
  if (!schema) return "";
  try {
    return JSON.stringify(schema, null, 2);
  } catch {
    return "";
  }
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

function stringifyExample(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function responseExamplesFromOperation(operation: OpenApiOperation): ReturnType<
  typeof snapshotResponseExample
>[] {
  const responses = operation.responses ?? {};
  const out: ReturnType<typeof snapshotResponseExample>[] = [];
  const preferredCodes = ["200", "201", "204"];
  const codes = [
    ...preferredCodes.filter((code) => responses[code]),
    ...Object.keys(responses).filter((code) => !preferredCodes.includes(code)),
  ];

  for (const code of codes) {
    const response = responses[code];
    if (!response?.content) continue;
    const status = Number.parseInt(code, 10);
    if (!Number.isFinite(status)) continue;
    const json = response.content["application/json"] ?? Object.values(response.content)[0];
    if (!json) continue;

    const named = json.examples
      ? Object.entries(json.examples).map(([key, item]) => ({
          name: item.summary?.trim() || key,
          value: item.value,
        }))
      : [];
    const singles =
      json.example != null || json.schema?.example != null
        ? [{ name: `${status} ${response.description ?? ""}`.trim() || `${status}`, value: json.example ?? json.schema?.example }]
        : [];

    for (const item of [...named, ...singles]) {
      if (item.value == null) continue;
      const body = stringifyExample(item.value);
      const httpResponse: HttpResponse = {
        status,
        statusText: response.description?.trim() || "",
        headers: [{ key: "Content-Type", value: "application/json" }],
        body,
        elapsedMs: 0,
        sizeBytes: new TextEncoder().encode(body).length,
        requestId: createId("openapi"),
      };
      out.push(snapshotResponseExample(httpResponse, item.name));
      if (out.length >= 5) return out;
    }
  }
  return out;
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
      const examples = responseExamplesFromOperation(op);
      const request = createRequest({
        name,
        method: method.toUpperCase() as HttpMethod,
        url: buildUrl(base, path, op),
        bodyKind,
        body: body || '{\n  \n}',
        responseSchema: responseSchema(op),
        examples,
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

export function listOpenApiOperations(raw: string): Array<{
  method: HttpMethod;
  path: string;
  summary: string;
  request: ApiRequest;
}> {
  const imported = importOpenApiCollection(raw);
  return imported.requests.map((saved) => {
    let path = saved.request.url;
    try {
      path = new URL(saved.request.url).pathname;
    } catch {
      const slash = saved.request.url.indexOf("/", saved.request.url.indexOf("//") + 2);
      path = slash >= 0 ? saved.request.url.slice(slash).split("?")[0] : saved.request.url;
    }
    return {
      method: saved.request.method,
      path,
      summary: saved.name,
      request: saved.request,
    };
  });
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
