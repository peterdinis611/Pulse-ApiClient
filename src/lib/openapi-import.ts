import { invoke } from "@tauri-apps/api/core";
import { createCollectionGroup } from "./collections";
import { createId, createRequest, normalizeRequest } from "./helpers";
import { canUseTauriIpc } from "./tauri-runtime";
import type { ApiRequest, CollectionGroup, HttpMethod, SavedRequest } from "@/types";

type OpenApiConvertPayload = {
  collectionGroups?: Array<Partial<CollectionGroup> & { id?: string; name?: string; source?: string; folders?: string[] }>;
  collections?: Array<Partial<SavedRequest> & { request?: Partial<ApiRequest> }>;
};

type OpenApiOperationRow = {
  method: string;
  path: string;
  summary: string;
  url: string;
  requestBody?: string;
  responseSchema?: string;
};

function requireTauri(): void {
  if (!canUseTauriIpc()) {
    throw new Error("OpenAPI import requires the desktop app");
  }
}

export function isOpenApiSpec(raw: string): boolean {
  try {
    const parsed = JSON.parse(raw) as { openapi?: string; swagger?: string; paths?: unknown };
    return Boolean(parsed.openapi || parsed.swagger) && Boolean(parsed.paths);
  } catch {
    return false;
  }
}

function mapSavedRequest(item: Partial<SavedRequest> & { request?: Partial<ApiRequest> }, fallbackCollectionId: string): SavedRequest {
  const request = normalizeRequest(item.request);
  return {
    id: item.id || createId("saved"),
    name: item.name || request.name,
    collectionId: item.collectionId || fallbackCollectionId,
    folder: item.folder,
    filePath: item.filePath,
    request,
  };
}

/** Convert OpenAPI JSON via pulse-core (`openapi_convert_spec`). */
export async function importOpenApiCollection(raw: string): Promise<{
  collection: CollectionGroup;
  requests: SavedRequest[];
}> {
  requireTauri();
  const spec = JSON.parse(raw) as unknown;
  const payload = await invoke<OpenApiConvertPayload>("openapi_convert_spec", { spec });
  const groupRaw = payload.collectionGroups?.[0];
  if (!groupRaw) {
    throw new Error("OpenAPI convert returned no collection");
  }
  const collection: CollectionGroup = {
    ...createCollectionGroup(groupRaw.name?.trim() || "OpenAPI Collection", "pulse"),
    id: groupRaw.id || createId("col"),
    name: groupRaw.name?.trim() || "OpenAPI Collection",
    source: "pulse",
    folders: groupRaw.folders ?? [],
  };
  const requests = (payload.collections ?? []).map((item) => mapSavedRequest(item, collection.id));
  if (requests.length === 0) {
    throw new Error("No HTTP operations found in OpenAPI spec");
  }
  return { collection, requests };
}

export async function listOpenApiOperations(raw: string): Promise<
  Array<{
    method: HttpMethod;
    path: string;
    summary: string;
    request: ApiRequest;
  }>
> {
  requireTauri();
  const spec = JSON.parse(raw) as unknown;
  const ops = await invoke<OpenApiOperationRow[]>("openapi_list_operations", { spec });
  return ops.map((op) => {
    const body = op.requestBody?.trim() ? op.requestBody : "{\n  \n}";
    const request = createRequest({
      name: op.summary,
      method: op.method.toUpperCase() as HttpMethod,
      url: op.url,
      bodyKind: op.requestBody?.trim() ? "json" : "none",
      body,
      responseSchema: op.responseSchema ?? "",
    });
    return {
      method: request.method,
      path: op.path,
      summary: op.summary,
      request,
    };
  });
}

export async function importOpenApiIntoState(
  raw: string,
  state: { collectionGroups: CollectionGroup[]; collections: SavedRequest[] },
) {
  const imported = await importOpenApiCollection(raw);
  return {
    collectionGroups: [...state.collectionGroups, imported.collection],
    collections: [...imported.requests, ...state.collections],
    activeCollectionId: imported.collection.id,
  };
}
