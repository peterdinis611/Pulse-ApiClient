import { defaultGraphqlQuery, defaultGraphqlVariables } from "./graphql";
import { createId, createKeyValue, createRequest, createSavedRequest, defaultAuth } from "./helpers";
import { normalizeTestsToPulse } from "./test-snippets";
import type { ApiRequest, AuthConfig, CollectionGroup, HttpMethod, KeyValue, SavedRequest } from "@/types";

type PostmanCollection = {
  info?: { name?: string; _postman_id?: string; schema?: string };
  item?: PostmanItem[];
};

type PostmanItem = {
  name?: string;
  item?: PostmanItem[];
  request?: PostmanRequest;
  event?: Array<{
    listen?: string;
    script?: { exec?: string | string[] };
  }>;
};

type PostmanRequest = {
  method?: string;
  header?: PostmanKeyValue[];
  url?: string | PostmanUrl;
  body?: {
    mode?: string;
    raw?: string;
    urlencoded?: PostmanKeyValue[];
    formdata?: Array<PostmanKeyValue & { type?: string; src?: string }>;
    graphql?: {
      query?: string;
      variables?: string;
    };
  };
  auth?: {
    type?: string;
    bearer?: Array<{ key?: string; value?: string }>;
    basic?: Array<{ key?: string; value?: string }>;
    apikey?: Array<{ key?: string; value?: string; in?: string }>;
  };
};

type PostmanKeyValue = {
  key?: string;
  value?: string;
  disabled?: boolean;
};

type PostmanUrl = {
  raw?: string;
  host?: string[];
  path?: string[];
  query?: PostmanKeyValue[];
};

export type PostmanImportResult = {
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
  "QUERY",
]);

function parseMethod(value?: string): HttpMethod {
  const method = (value ?? "GET").toUpperCase();
  return HTTP_METHODS.has(method as HttpMethod) ? (method as HttpMethod) : "GET";
}

function parseKeyValues(items: PostmanKeyValue[] | undefined): KeyValue[] {
  if (!items?.length) return [createKeyValue()];
  return items.map((item) =>
    createKeyValue({
      key: item.key ?? "",
      value: item.value ?? "",
      enabled: !item.disabled,
    }),
  );
}

function parseUrl(url: PostmanRequest["url"], queryFromUrl?: PostmanKeyValue[]): { url: string; query: KeyValue[] } {
  if (typeof url === "string") {
    return { url, query: parseKeyValues(queryFromUrl) };
  }

  if (!url) {
    return { url: "", query: parseKeyValues(queryFromUrl) };
  }

  if (url.raw?.trim()) {
    return { url: url.raw, query: parseKeyValues(url.query ?? queryFromUrl) };
  }

  const host = (url.host ?? []).join(".");
  const path = (url.path ?? []).join("/");
  const built = [host, path].filter(Boolean).join("/");
  const normalized = built.startsWith("http") ? built : `https://${built}`;

  return { url: normalized, query: parseKeyValues(url.query ?? queryFromUrl) };
}

function parseAuth(auth: PostmanRequest["auth"]): AuthConfig {
  const base = defaultAuth();
  if (!auth?.type || auth.type === "noauth") return base;

  if (auth.type === "bearer") {
    const token = auth.bearer?.find((item) => item.key === "token")?.value ?? "";
    return { ...base, authType: "bearer", bearerToken: token };
  }

  if (auth.type === "basic") {
    return {
      ...base,
      authType: "basic",
      basicUsername: auth.basic?.find((item) => item.key === "username")?.value ?? "",
      basicPassword: auth.basic?.find((item) => item.key === "password")?.value ?? "",
    };
  }

  if (auth.type === "apikey") {
    const keyEntry = auth.apikey?.find((item) => item.key === "key");
    const valueEntry = auth.apikey?.find((item) => item.key === "value");
    const inEntry = auth.apikey?.find((item) => item.key === "in");
    return {
      ...base,
      authType: "apiKey",
      apiKeyKey: keyEntry?.value ?? "",
      apiKeyValue: valueEntry?.value ?? "",
      apiKeyIn: inEntry?.value === "query" ? "query" : "header",
    };
  }

  return base;
}

function parseBody(
  body: PostmanRequest["body"],
): Pick<
  ApiRequest,
  | "bodyKind"
  | "body"
  | "form"
  | "multipart"
  | "graphqlQuery"
  | "graphqlVariables"
  | "graphqlOperationName"
> {
  const emptyMultipart = [
    {
      id: createId("mp"),
      key: "",
      value: "",
      enabled: true,
      fieldType: "text" as const,
    },
  ];

  if (body?.mode === "graphql") {
    return {
      bodyKind: "graphql",
      body: "",
      graphqlQuery: body.graphql?.query ?? defaultGraphqlQuery(),
      graphqlVariables: body.graphql?.variables ?? defaultGraphqlVariables(),
      graphqlOperationName: "",
      form: [createKeyValue()],
      multipart: emptyMultipart,
    };
  }

  if (!body?.mode || body.mode === "raw") {
    return {
      bodyKind: body?.mode === "raw" ? "raw" : "none",
      body: body?.raw ?? "",
      graphqlQuery: defaultGraphqlQuery(),
      graphqlVariables: defaultGraphqlVariables(),
      graphqlOperationName: "",
      form: [createKeyValue()],
      multipart: emptyMultipart,
    };
  }

  if (body.mode === "urlencoded") {
    return {
      bodyKind: "form",
      body: "",
      graphqlQuery: defaultGraphqlQuery(),
      graphqlVariables: defaultGraphqlVariables(),
      graphqlOperationName: "",
      form: parseKeyValues(body.urlencoded),
      multipart: emptyMultipart,
    };
  }

  if (body.mode === "formdata") {
    const multipart = (body.formdata ?? []).map((field) => ({
      id: createId("mp"),
      key: field.key ?? "",
      value: field.value ?? "",
      enabled: !field.disabled,
      fieldType: field.type === "file" ? ("file" as const) : ("text" as const),
      fileName: field.type === "file" ? field.src : undefined,
    }));

    return {
      bodyKind: "multipart",
      body: "",
      graphqlQuery: defaultGraphqlQuery(),
      graphqlVariables: defaultGraphqlVariables(),
      graphqlOperationName: "",
      form: [createKeyValue()],
      multipart: multipart.length ? multipart : emptyMultipart,
    };
  }

  return {
    bodyKind: "none",
    body: "",
    graphqlQuery: defaultGraphqlQuery(),
    graphqlVariables: defaultGraphqlVariables(),
    graphqlOperationName: "",
    form: [createKeyValue()],
    multipart: emptyMultipart,
  };
}

function parsePostmanScript(item: PostmanItem, listen: "test" | "prerequest"): string | undefined {
  const event = item.event?.find((entry) => entry.listen === listen);
  const exec = event?.script?.exec;
  if (!exec) return undefined;
  const raw = Array.isArray(exec) ? exec.join("\n") : exec;
  return normalizeTestsToPulse(raw);
}

function parsePostmanRequest(item: PostmanItem): ApiRequest | null {
  if (!item.request) return null;

  const { url, query } = parseUrl(item.request.url);
  const body = parseBody(item.request.body);

  return createRequest({
    name: item.name?.trim() || "Untitled Request",
    method: body.bodyKind === "graphql" ? "POST" : parseMethod(item.request.method),
    url,
    headers: parseKeyValues(item.request.header),
    query,
    auth: parseAuth(item.request.auth),
    tests: parsePostmanScript(item, "test"),
    preRequestScript: parsePostmanScript(item, "prerequest") ?? "",
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
  items: PostmanItem[] | undefined,
  collectionId: string,
  folderPath: string,
  requests: SavedRequest[],
  folderPaths: Set<string>,
) {
  for (const item of items ?? []) {
    if (item.item?.length) {
      const nextFolder = folderPath ? `${folderPath}/${item.name ?? "Folder"}` : (item.name ?? "Folder");
      collectFolders(folderPaths, nextFolder);
      walkItems(item.item, collectionId, nextFolder, requests, folderPaths);
      continue;
    }

    const request = parsePostmanRequest(item);
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

export function isPostmanCollection(raw: string): boolean {
  try {
    const parsed = JSON.parse(raw) as PostmanCollection & { collection?: PostmanCollection };
    const collection = parsed.collection ?? parsed;
    return Boolean(
      collection.info?.schema?.includes("postman") ||
        (collection.info?.name && collection.item?.length),
    );
  } catch {
    return false;
  }
}

export function importPostmanCollection(raw: string): PostmanImportResult {
  const parsed = JSON.parse(raw) as PostmanCollection & { collection?: PostmanCollection };
  const collectionData = parsed.collection ?? parsed;

  if (!collectionData.item?.length) {
    throw new Error("Postman collection has no requests.");
  }

  const collectionId = createId("col");
  const folderPaths = new Set<string>();
  const requests: SavedRequest[] = [];

  walkItems(collectionData.item, collectionId, "", requests, folderPaths);

  if (!requests.length) {
    throw new Error("No valid requests found in Postman collection.");
  }

  const collection: CollectionGroup = {
    id: collectionId,
    name: collectionData.info?.name?.trim() || "Imported Collection",
    source: "postman",
    folders: [...folderPaths].sort(),
  };

  return { collection, requests };
}
