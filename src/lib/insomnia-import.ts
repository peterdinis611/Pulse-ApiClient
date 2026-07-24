import {
  createId,
  createKeyValue,
  createRequest,
  createSavedRequest,
  defaultAuth,
} from "./helpers";
import { defaultGraphqlQuery, defaultGraphqlVariables } from "./graphql";
import type {
  ApiRequest,
  AuthConfig,
  BodyKind,
  CollectionGroup,
  HttpMethod,
  KeyValue,
  MultipartField,
  SavedRequest,
} from "@/types";

type InsomniaResource = {
  _id: string;
  _type: string;
  parentId?: string | null;
  name?: string;
  method?: string;
  url?: string;
  headers?: Array<{ name?: string; value?: string; disabled?: boolean }>;
  parameters?: Array<{ name?: string; value?: string; disabled?: boolean }>;
  body?: {
    mimeType?: string | null;
    text?: string;
    params?: Array<{ name?: string; value?: string; disabled?: boolean; type?: string; fileName?: string }>;
  };
  authentication?: {
    type?: string;
    token?: string;
    username?: string;
    password?: string;
    key?: string;
    value?: string;
    addTo?: string;
    disabled?: boolean;
  };
};

type InsomniaExport = {
  _type?: string;
  __export_format?: number;
  resources?: InsomniaResource[];
};

export type InsomniaImportResult = {
  collection: CollectionGroup;
  requests: SavedRequest[];
};

const HTTP_METHODS = new Set<HttpMethod>([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
]);

function parseMethod(value?: string): HttpMethod {
  const method = (value ?? "GET").toUpperCase();
  return HTTP_METHODS.has(method as HttpMethod) ? (method as HttpMethod) : "GET";
}

function parseKeyValues(
  items: Array<{ name?: string; value?: string; disabled?: boolean }> | undefined,
): KeyValue[] {
  if (!items?.length) return [createKeyValue()];
  return items.map((item) =>
    createKeyValue({
      key: item.name ?? "",
      value: item.value ?? "",
      enabled: !item.disabled,
    }),
  );
}

function parseAuth(auth: InsomniaResource["authentication"]): AuthConfig {
  const base = defaultAuth();
  if (!auth || auth.disabled || !auth.type || auth.type === "none") return base;

  if (auth.type === "bearer") {
    return { ...base, authType: "bearer", bearerToken: auth.token ?? "" };
  }
  if (auth.type === "basic") {
    return {
      ...base,
      authType: "basic",
      basicUsername: auth.username ?? "",
      basicPassword: auth.password ?? "",
    };
  }
  if (auth.type === "apikey") {
    return {
      ...base,
      authType: "apiKey",
      apiKeyKey: auth.key ?? "",
      apiKeyValue: auth.value ?? "",
      apiKeyIn: auth.addTo === "queryparams" || auth.addTo === "query" ? "query" : "header",
    };
  }
  return base;
}

function parseBody(body: InsomniaResource["body"]): Pick<
  ApiRequest,
  "bodyKind" | "body" | "form" | "multipart" | "graphqlQuery" | "graphqlVariables"
> {
  const mime = body?.mimeType?.toLowerCase() ?? "";

  if (!mime || mime === "application/octet-stream") {
    if (!body?.text?.trim() && !body?.params?.length) {
      return {
        bodyKind: "none",
        body: "",
        form: [createKeyValue()],
        multipart: [],
        graphqlQuery: defaultGraphqlQuery(),
        graphqlVariables: defaultGraphqlVariables(),
      };
    }
  }

  if (mime.includes("json") || mime.includes("graphql")) {
    if (mime.includes("graphql")) {
      try {
        const parsed = JSON.parse(body?.text ?? "{}") as {
          query?: string;
          variables?: unknown;
          operationName?: string;
        };
        return {
          bodyKind: "graphql",
          body: "",
          form: [createKeyValue()],
          multipart: [],
          graphqlQuery: parsed.query ?? defaultGraphqlQuery(),
          graphqlVariables:
            typeof parsed.variables === "string"
              ? parsed.variables
              : JSON.stringify(parsed.variables ?? {}, null, 2),
        };
      } catch {
        return {
          bodyKind: "graphql",
          body: "",
          form: [createKeyValue()],
          multipart: [],
          graphqlQuery: body?.text ?? defaultGraphqlQuery(),
          graphqlVariables: defaultGraphqlVariables(),
        };
      }
    }
    return {
      bodyKind: "json" satisfies BodyKind,
      body: body?.text ?? "",
      form: [createKeyValue()],
      multipart: [],
      graphqlQuery: defaultGraphqlQuery(),
      graphqlVariables: defaultGraphqlVariables(),
    };
  }

  if (mime.includes("x-www-form-urlencoded")) {
    return {
      bodyKind: "form",
      body: "",
      form: parseKeyValues(body?.params),
      multipart: [],
      graphqlQuery: defaultGraphqlQuery(),
      graphqlVariables: defaultGraphqlVariables(),
    };
  }

  if (mime.includes("multipart")) {
    const multipart: MultipartField[] = (body?.params ?? []).map((item) => ({
      id: createId("mp"),
      key: item.name ?? "",
      value: item.value ?? "",
      enabled: !item.disabled,
      fieldType: item.type === "file" || item.fileName ? "file" : "text",
      fileName: item.fileName,
    }));
    return {
      bodyKind: "multipart",
      body: "",
      form: [createKeyValue()],
      multipart,
      graphqlQuery: defaultGraphqlQuery(),
      graphqlVariables: defaultGraphqlVariables(),
    };
  }

  return {
    bodyKind: "raw",
    body: body?.text ?? "",
    form: [createKeyValue()],
    multipart: [],
    graphqlQuery: defaultGraphqlQuery(),
    graphqlVariables: defaultGraphqlVariables(),
  };
}

function buildFolderPath(
  resourceId: string,
  byId: Map<string, InsomniaResource>,
  cache: Map<string, string>,
): string {
  const cached = cache.get(resourceId);
  if (cached != null) return cached;

  const resource = byId.get(resourceId);
  if (!resource || resource._type !== "request_group") {
    cache.set(resourceId, "");
    return "";
  }

  const parentPath = resource.parentId ? buildFolderPath(resource.parentId, byId, cache) : "";
  const name = resource.name?.trim() || "Folder";
  const path = parentPath ? `${parentPath}/${name}` : name;
  cache.set(resourceId, path);
  return path;
}

function workspaceName(resources: InsomniaResource[]): string {
  const workspace = resources.find((item) => item._type === "workspace" || item._type === "project");
  return workspace?.name?.trim() || "Insomnia Collection";
}

export function isInsomniaExport(raw: string): boolean {
  try {
    const parsed = JSON.parse(raw) as InsomniaExport;
    if (parsed._type === "export" && Array.isArray(parsed.resources)) return true;
    if (typeof parsed.__export_format === "number" && Array.isArray(parsed.resources)) return true;
    return Boolean(
      Array.isArray(parsed.resources) &&
        parsed.resources.some((item) => item._type === "request" || item._type === "request_group"),
    );
  } catch {
    return false;
  }
}

export function importInsomniaCollection(raw: string): InsomniaImportResult {
  const parsed = JSON.parse(raw) as InsomniaExport;
  const resources = parsed.resources ?? [];
  if (!resources.length) {
    throw new Error("Insomnia export has no resources.");
  }

  const byId = new Map(resources.map((item) => [item._id, item]));
  const folderCache = new Map<string, string>();
  const folderPaths = new Set<string>();
  const collectionId = createId("col");
  const requests: SavedRequest[] = [];

  for (const resource of resources) {
    if (resource._type !== "request") continue;

    const folder = resource.parentId ? buildFolderPath(resource.parentId, byId, folderCache) : "";
    if (folder) {
      const parts = folder.split("/");
      for (let index = 1; index <= parts.length; index += 1) {
        folderPaths.add(parts.slice(0, index).join("/"));
      }
    }

    const body = parseBody(resource.body);
    const request = createRequest({
      name: resource.name?.trim() || "Untitled Request",
      method: parseMethod(resource.method),
      url: resource.url?.trim() ?? "",
      headers: parseKeyValues(resource.headers),
      query: parseKeyValues(resource.parameters),
      auth: parseAuth(resource.authentication),
      ...body,
    });

    requests.push(
      createSavedRequest(request, {
        collectionId,
        folder: folder || undefined,
        name: request.name,
      }),
    );
  }

  if (!requests.length) {
    throw new Error("No valid requests found in Insomnia export.");
  }

  return {
    collection: {
      id: collectionId,
      name: workspaceName(resources),
      source: "insomnia",
      folders: [...folderPaths].sort(),
    },
    requests,
  };
}

export function importInsomniaIntoState(
  raw: string,
  state: {
    collectionGroups: CollectionGroup[];
    collections: SavedRequest[];
    activeCollectionId: string | null;
  },
) {
  const imported = importInsomniaCollection(raw);
  return {
    collectionGroups: [...state.collectionGroups, imported.collection],
    collections: [...imported.requests, ...state.collections],
    activeCollectionId: imported.collection.id,
  };
}
