import { groupRequestsByFolder } from "./collections";
import type { ApiRequest, AuthConfig, CollectionGroup, KeyValue, SavedRequest } from "@/types";

type BrunoKeyValue = {
  name: string;
  value: string;
  enabled: boolean;
  type?: string;
};

type BrunoAuth = {
  mode: string;
  bearer?: { token: string };
  basic?: { username: string; password: string };
  apikey?: { key: string; value: string; placement: string };
};

type BrunoBody = {
  mode: string;
  json?: string | null;
  text?: string | null;
  formUrlEncoded?: BrunoKeyValue[];
  multipartForm?: Array<BrunoKeyValue & { type?: string }>;
  graphql?: { query: string; variables: string };
};

type BrunoItem = {
  type: string;
  name: string;
  request?: {
    url: string;
    method: string;
    headers: BrunoKeyValue[];
    params: BrunoKeyValue[];
    body: BrunoBody;
    auth: BrunoAuth;
  };
  items?: BrunoItem[];
};

function toBrunoKeyValues(items: KeyValue[] | undefined, type?: string): BrunoKeyValue[] {
  return (items ?? [])
    .filter((item) => item.key.trim() || item.value.trim())
    .map((item) => ({
      name: item.key,
      value: item.value,
      enabled: item.enabled !== false,
      ...(type ? { type } : {}),
    }));
}

function toBrunoAuth(auth?: AuthConfig): BrunoAuth {
  if (!auth || auth.authType === "none" || auth.authType === "inherit") {
    return { mode: "none" };
  }
  if (auth.authType === "bearer") {
    return { mode: "bearer", bearer: { token: auth.bearerToken } };
  }
  if (auth.authType === "basic") {
    return {
      mode: "basic",
      basic: { username: auth.basicUsername, password: auth.basicPassword },
    };
  }
  if (auth.authType === "apiKey") {
    return {
      mode: "apikey",
      apikey: {
        key: auth.apiKeyKey,
        value: auth.apiKeyValue,
        placement: auth.apiKeyIn === "query" ? "query" : "header",
      },
    };
  }
  return { mode: "none" };
}

function toBrunoBody(request: ApiRequest): BrunoBody {
  if (request.bodyKind === "json") {
    return { mode: "json", json: request.body };
  }
  if (request.bodyKind === "raw") {
    return { mode: "text", text: request.body };
  }
  if (request.bodyKind === "form") {
    return { mode: "formUrlEncoded", formUrlEncoded: toBrunoKeyValues(request.form) };
  }
  if (request.bodyKind === "multipart") {
    return {
      mode: "multipartForm",
      multipartForm: (request.multipart ?? [])
        .filter((field) => field.key.trim() || field.value.trim() || field.fileName)
        .map((field) => ({
          name: field.key,
          value: field.fieldType === "file" ? (field.fileName ?? "") : field.value,
          enabled: field.enabled !== false,
          type: field.fieldType === "file" ? "file" : "text",
        })),
    };
  }
  if (request.bodyKind === "graphql") {
    return {
      mode: "graphql",
      graphql: {
        query: request.graphqlQuery,
        variables: request.graphqlVariables,
      },
    };
  }
  return { mode: "none" };
}

function toBrunoRequest(saved: SavedRequest): BrunoItem {
  const request = saved.request;
  const params = [
    ...toBrunoKeyValues(request.query, "query"),
    ...toBrunoKeyValues(request.pathParams, "path"),
  ];
  return {
    type: request.bodyKind === "graphql" ? "graphql" : "http",
    name: saved.name,
    request: {
      url: request.url,
      method: request.bodyKind === "graphql" ? "POST" : request.method,
      headers: toBrunoKeyValues(request.headers),
      params,
      body: toBrunoBody(request),
      auth: toBrunoAuth(request.auth),
    },
  };
}

function folderToBrunoItem(
  folder: ReturnType<typeof groupRequestsByFolder>["folders"][number],
): BrunoItem {
  return {
    type: "folder",
    name: folder.name,
    items: [
      ...folder.requests.map(toBrunoRequest),
      ...folder.children.map(folderToBrunoItem),
    ],
  };
}

export function exportBrunoCollection(group: CollectionGroup, requests: SavedRequest[]): string {
  const grouped = groupRequestsByFolder(requests, group.folders);
  const items: BrunoItem[] = [
    ...grouped.root.map(toBrunoRequest),
    ...grouped.folders.map(folderToBrunoItem),
  ];

  return JSON.stringify(
    {
      name: group.name,
      version: "1",
      items,
    },
    null,
    2,
  );
}
