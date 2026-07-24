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

type BrunoKeyValue = {
  name?: string;
  value?: string | number | boolean | null;
  enabled?: boolean;
  type?: string;
};

type BrunoAuth = {
  mode?: string;
  bearer?: { token?: string };
  basic?: { username?: string; password?: string };
  apikey?: { key?: string; value?: string; placement?: string };
};

type BrunoBody = {
  mode?: string;
  json?: string | null;
  text?: string | null;
  xml?: string | null;
  sparql?: string | null;
  formUrlEncoded?: BrunoKeyValue[];
  multipartForm?: Array<BrunoKeyValue & { type?: string }>;
  graphql?: { query?: string; variables?: string };
};

type BrunoRequest = {
  url?: string;
  method?: string;
  headers?: BrunoKeyValue[];
  params?: BrunoKeyValue[];
  body?: BrunoBody;
  auth?: BrunoAuth;
};

type BrunoItem = {
  type?: string;
  name?: string;
  request?: BrunoRequest;
  items?: BrunoItem[];
};

type BrunoCollection = {
  name?: string;
  version?: string;
  items?: BrunoItem[];
};

export type BrunoImportResult = {
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

function asString(value: unknown): string {
  if (value == null) return "";
  return String(value);
}

function parseMethod(value?: string): HttpMethod {
  const method = (value ?? "GET").toUpperCase();
  return HTTP_METHODS.has(method as HttpMethod) ? (method as HttpMethod) : "GET";
}

function parseKeyValues(items: BrunoKeyValue[] | undefined, keyField: "name" | "key" = "name"): KeyValue[] {
  if (!items?.length) return [createKeyValue()];
  return items.map((item) =>
    createKeyValue({
      key: asString((item as { name?: string; key?: string })[keyField] ?? item.name),
      value: asString(item.value),
      enabled: item.enabled !== false,
    }),
  );
}

function parseAuth(auth: BrunoAuth | undefined): AuthConfig {
  const base = defaultAuth();
  const mode = auth?.mode?.toLowerCase();
  if (!mode || mode === "none" || mode === "inherit") return base;

  if (mode === "bearer") {
    return { ...base, authType: "bearer", bearerToken: auth?.bearer?.token ?? "" };
  }
  if (mode === "basic") {
    return {
      ...base,
      authType: "basic",
      basicUsername: auth?.basic?.username ?? "",
      basicPassword: auth?.basic?.password ?? "",
    };
  }
  if (mode === "apikey") {
    const placement = auth?.apikey?.placement?.toLowerCase();
    return {
      ...base,
      authType: "apiKey",
      apiKeyKey: auth?.apikey?.key ?? "",
      apiKeyValue: auth?.apikey?.value ?? "",
      apiKeyIn: placement === "query" || placement === "queryparams" ? "query" : "header",
    };
  }
  return base;
}

function parseBody(body: BrunoBody | undefined): Pick<
  ApiRequest,
  "bodyKind" | "body" | "form" | "multipart" | "graphqlQuery" | "graphqlVariables"
> {
  const mode = body?.mode?.toLowerCase() ?? "none";

  if (mode === "json") {
    return {
      bodyKind: "json" satisfies BodyKind,
      body: body?.json ?? "",
      form: [createKeyValue()],
      multipart: [],
      graphqlQuery: defaultGraphqlQuery(),
      graphqlVariables: defaultGraphqlVariables(),
    };
  }

  if (mode === "text" || mode === "xml" || mode === "sparql") {
    return {
      bodyKind: "raw",
      body: body?.text ?? body?.xml ?? body?.sparql ?? "",
      form: [createKeyValue()],
      multipart: [],
      graphqlQuery: defaultGraphqlQuery(),
      graphqlVariables: defaultGraphqlVariables(),
    };
  }

  if (mode === "formurlencoded" || mode === "form-urlencoded") {
    return {
      bodyKind: "form",
      body: "",
      form: parseKeyValues(body?.formUrlEncoded),
      multipart: [],
      graphqlQuery: defaultGraphqlQuery(),
      graphqlVariables: defaultGraphqlVariables(),
    };
  }

  if (mode === "multipartform" || mode === "multipart-form") {
    const multipart: MultipartField[] = (body?.multipartForm ?? []).map((item) => ({
      id: createId("mp"),
      key: asString(item.name),
      value: asString(item.value),
      enabled: item.enabled !== false,
      fieldType: item.type === "file" ? "file" : "text",
    }));
    return {
      bodyKind: "multipart",
      body: "",
      form: [createKeyValue()],
      multipart: multipart.length ? multipart : [],
      graphqlQuery: defaultGraphqlQuery(),
      graphqlVariables: defaultGraphqlVariables(),
    };
  }

  if (mode === "graphql") {
    return {
      bodyKind: "graphql",
      body: "",
      form: [createKeyValue()],
      multipart: [],
      graphqlQuery: body?.graphql?.query ?? defaultGraphqlQuery(),
      graphqlVariables: body?.graphql?.variables ?? defaultGraphqlVariables(),
    };
  }

  return {
    bodyKind: "none",
    body: "",
    form: [createKeyValue()],
    multipart: [],
    graphqlQuery: defaultGraphqlQuery(),
    graphqlVariables: defaultGraphqlVariables(),
  };
}

function parseParams(params: BrunoKeyValue[] | undefined): {
  query: KeyValue[];
  pathVars: KeyValue[];
} {
  const query: KeyValue[] = [];
  const pathVars: KeyValue[] = [];
  for (const param of params ?? []) {
    const entry = createKeyValue({
      key: asString(param.name),
      value: asString(param.value),
      enabled: param.enabled !== false,
    });
    if (param.type === "path") pathVars.push(entry);
    else query.push(entry);
  }
  return {
    query: query.length ? query : [createKeyValue()],
    pathVars,
  };
}

function applyPathVars(url: string, pathVars: KeyValue[]): string {
  let result = url;
  for (const item of pathVars) {
    if (!item.key.trim()) continue;
    result = result.split(`:${item.key}`).join(item.value).split(`{${item.key}}`).join(item.value);
  }
  return result;
}

function parseBrunoRequest(item: BrunoItem): ApiRequest | null {
  if (!item.request) return null;
  const { query, pathVars } = parseParams(item.request.params);
  const body = parseBody(item.request.body);
  return createRequest({
    name: item.name?.trim() || "Untitled Request",
    method: parseMethod(item.request.method),
    url: applyPathVars(item.request.url?.trim() ?? "", pathVars),
    headers: parseKeyValues(item.request.headers),
    query,
    auth: parseAuth(item.request.auth),
    ...body,
  });
}

function collectFolders(folderPaths: Set<string>, path: string) {
  if (!path.trim()) return;
  folderPaths.add(path);
  const parts = path.split("/");
  if (parts.length > 1) {
    collectFolders(folderPaths, parts.slice(0, -1).join("/"));
  }
}

function walkItems(
  items: BrunoItem[] | undefined,
  collectionId: string,
  folderPath: string,
  requests: SavedRequest[],
  folderPaths: Set<string>,
) {
  for (const item of items ?? []) {
    const isFolder =
      item.type === "folder" || (Array.isArray(item.items) && item.items.length > 0 && !item.request);

    if (isFolder) {
      const nextFolder = folderPath ? `${folderPath}/${item.name ?? "Folder"}` : (item.name ?? "Folder");
      collectFolders(folderPaths, nextFolder);
      walkItems(item.items, collectionId, nextFolder, requests, folderPaths);
      continue;
    }

    const request = parseBrunoRequest(item);
    if (!request) continue;
    if (folderPath) collectFolders(folderPaths, folderPath);

    requests.push(
      createSavedRequest(request, {
        collectionId,
        folder: folderPath || undefined,
        name: item.name?.trim() || request.name,
      }),
    );
  }
}

export function isBrunoCollection(raw: string): boolean {
  try {
    const parsed = JSON.parse(raw) as BrunoCollection & { brunoConfig?: unknown };
    if (parsed.brunoConfig) return true;
    return Boolean(
      typeof parsed.name === "string" &&
        Array.isArray(parsed.items) &&
        (parsed.version != null ||
          parsed.items.some(
            (item) =>
              item?.type === "http" ||
              item?.type === "graphql" ||
              item?.type === "folder" ||
              item?.request,
          )),
    );
  } catch {
    return false;
  }
}

export function importBrunoCollection(raw: string): BrunoImportResult {
  const parsed = JSON.parse(raw) as BrunoCollection;
  if (!parsed.items?.length) {
    throw new Error("Bruno collection has no requests.");
  }

  const collectionId = createId("col");
  const folderPaths = new Set<string>();
  const requests: SavedRequest[] = [];
  walkItems(parsed.items, collectionId, "", requests, folderPaths);

  if (!requests.length) {
    throw new Error("No valid requests found in Bruno collection.");
  }

  return {
    collection: {
      id: collectionId,
      name: parsed.name?.trim() || "Bruno Collection",
      source: "bruno",
      folders: [...folderPaths].sort(),
    },
    requests,
  };
}

export function importBrunoIntoState(
  raw: string,
  state: {
    collectionGroups: CollectionGroup[];
    collections: SavedRequest[];
    activeCollectionId: string | null;
  },
) {
  const imported = importBrunoCollection(raw);
  return {
    collectionGroups: [...state.collectionGroups, imported.collection],
    collections: [...imported.requests, ...state.collections],
    activeCollectionId: imported.collection.id,
  };
}
