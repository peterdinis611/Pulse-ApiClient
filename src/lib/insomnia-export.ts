import { createId } from "./helpers";
import type { ApiRequest, AuthConfig, CollectionGroup, KeyValue, SavedRequest } from "@/types";

type InsomniaResource = {
  _id: string;
  _type: string;
  parentId?: string | null;
  name?: string;
  method?: string;
  url?: string;
  headers?: Array<{ name: string; value: string; disabled?: boolean }>;
  parameters?: Array<{ name: string; value: string; disabled?: boolean }>;
  body?: {
    mimeType?: string | null;
    text?: string;
    params?: Array<{
      name: string;
      value: string;
      disabled?: boolean;
      type?: string;
      fileName?: string;
    }>;
  };
  authentication?: Record<string, unknown>;
};

function toInsomniaKeyValues(
  items: KeyValue[] | undefined,
): Array<{ name: string; value: string; disabled?: boolean }> {
  return (items ?? [])
    .filter((item) => item.key.trim() || item.value.trim())
    .map((item) => ({
      name: item.key,
      value: item.value,
      ...(item.enabled === false ? { disabled: true } : {}),
    }));
}

function toInsomniaAuth(auth?: AuthConfig): InsomniaResource["authentication"] {
  if (!auth || auth.authType === "none" || auth.authType === "inherit") {
    return { type: "none" };
  }
  if (auth.authType === "bearer") {
    return { type: "bearer", token: auth.bearerToken };
  }
  if (auth.authType === "basic") {
    return { type: "basic", username: auth.basicUsername, password: auth.basicPassword };
  }
  if (auth.authType === "apiKey") {
    return {
      type: "apikey",
      key: auth.apiKeyKey,
      value: auth.apiKeyValue,
      addTo: auth.apiKeyIn === "query" ? "queryparams" : "header",
    };
  }
  return { type: "none" };
}

function toInsomniaBody(request: ApiRequest): InsomniaResource["body"] {
  if (request.bodyKind === "json") {
    return { mimeType: "application/json", text: request.body };
  }
  if (request.bodyKind === "graphql") {
    return {
      mimeType: "application/graphql",
      text: JSON.stringify({
        query: request.graphqlQuery,
        variables: (() => {
          try {
            return JSON.parse(request.graphqlVariables || "{}");
          } catch {
            return {};
          }
        })(),
      }),
    };
  }
  if (request.bodyKind === "form") {
    return {
      mimeType: "application/x-www-form-urlencoded",
      params: toInsomniaKeyValues(request.form),
    };
  }
  if (request.bodyKind === "multipart") {
    return {
      mimeType: "multipart/form-data",
      params: (request.multipart ?? [])
        .filter((field) => field.key.trim() || field.value.trim() || field.fileName)
        .map((field) => ({
          name: field.key,
          value: field.fieldType === "file" ? "" : field.value,
          ...(field.enabled === false ? { disabled: true } : {}),
          ...(field.fieldType === "file"
            ? { type: "file", fileName: field.fileName ?? "" }
            : {}),
        })),
    };
  }
  if (request.bodyKind === "raw") {
    return { mimeType: "text/plain", text: request.body };
  }
  return { mimeType: null, text: "" };
}

function ensureFolderIds(
  folderPath: string,
  workspaceId: string,
  folderIds: Map<string, string>,
  resources: InsomniaResource[],
): string {
  if (!folderPath.trim()) return workspaceId;
  const existing = folderIds.get(folderPath);
  if (existing) return existing;

  const parts = folderPath.split("/");
  const parentPath = parts.slice(0, -1).join("/");
  const parentId = parentPath
    ? ensureFolderIds(parentPath, workspaceId, folderIds, resources)
    : workspaceId;
  const id = createId("fld");
  folderIds.set(folderPath, id);
  resources.push({
    _id: id,
    _type: "request_group",
    parentId,
    name: parts[parts.length - 1] || "Folder",
  });
  return id;
}

export function exportInsomniaCollection(group: CollectionGroup, requests: SavedRequest[]): string {
  const workspaceId = createId("wrk");
  const resources: InsomniaResource[] = [
    {
      _id: workspaceId,
      _type: "workspace",
      name: group.name,
      parentId: null,
    },
  ];
  const folderIds = new Map<string, string>();

  for (const path of group.folders ?? []) {
    ensureFolderIds(path, workspaceId, folderIds, resources);
  }

  for (const saved of requests) {
    const folder = saved.folder?.trim() ?? "";
    const parentId = folder
      ? ensureFolderIds(folder, workspaceId, folderIds, resources)
      : workspaceId;
    const request = saved.request;
    resources.push({
      _id: createId("req"),
      _type: "request",
      parentId,
      name: saved.name,
      method: request.bodyKind === "graphql" ? "POST" : request.method,
      url: request.url,
      headers: toInsomniaKeyValues(request.headers),
      parameters: toInsomniaKeyValues(request.query),
      body: toInsomniaBody(request),
      authentication: toInsomniaAuth(request.auth),
    });
  }

  return JSON.stringify(
    {
      _type: "export",
      __export_format: 4,
      __export_date: new Date().toISOString(),
      __export_source: "pulse.export",
      resources,
    },
    null,
    2,
  );
}
