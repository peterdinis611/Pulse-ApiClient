import { groupRequestsByFolder } from "./collections";
import type { ApiRequest, AuthConfig, CollectionGroup, FolderConfig, KeyValue, SavedRequest } from "@/types";

type PostmanKeyValue = {
  key: string;
  value: string;
  disabled?: boolean;
};

type PostmanEvent = {
  listen: string;
  script: { type: string; exec: string[] };
};

type PostmanItem = {
  name: string;
  item?: PostmanItem[];
  request?: PostmanRequest;
  auth?: Record<string, unknown>;
  variable?: PostmanKeyValue[];
  event?: PostmanEvent[];
};

type PostmanRequest = {
  method: string;
  header: PostmanKeyValue[];
  url: string | { raw: string; query?: PostmanKeyValue[]; variable?: PostmanKeyValue[] };
  body?: Record<string, unknown>;
  auth?: Record<string, unknown>;
};

type PostmanCollection = {
  info: {
    _postman_id: string;
    name: string;
    schema: string;
  };
  item: PostmanItem[];
  auth?: Record<string, unknown>;
  variable?: PostmanKeyValue[];
  event?: PostmanEvent[];
};

function toPostmanKeyValues(items: KeyValue[] | undefined): PostmanKeyValue[] {
  return (items ?? [])
    .filter((item) => item.key.trim() || item.value.trim())
    .map((item) => ({
      key: item.key,
      value: item.value,
      ...(item.enabled ? {} : { disabled: true }),
    }));
}

function toPostmanAuth(auth?: AuthConfig): PostmanRequest["auth"] | undefined {
  if (!auth || auth.authType === "none") return undefined;

  if (auth.authType === "inherit") {
    return { type: "inherit" };
  }

  if (auth.authType === "bearer") {
    return {
      type: "bearer",
      bearer: [{ key: "token", value: auth.bearerToken, type: "string" }],
    };
  }

  if (auth.authType === "basic") {
    return {
      type: "basic",
      basic: [
        { key: "username", value: auth.basicUsername, type: "string" },
        { key: "password", value: auth.basicPassword, type: "string" },
      ],
    };
  }

  if (auth.authType === "apiKey") {
    return {
      type: "apikey",
      apikey: [
        { key: "key", value: auth.apiKeyKey, type: "string" },
        { key: "value", value: auth.apiKeyValue, type: "string" },
        { key: "in", value: auth.apiKeyIn, type: "string" },
      ],
    };
  }

  return undefined;
}

function toPostmanEvents(preRequestScript?: string, tests?: string): PostmanEvent[] | undefined {
  const event: PostmanEvent[] = [];
  if (preRequestScript?.trim()) {
    event.push({
      listen: "prerequest",
      script: { type: "text/javascript", exec: preRequestScript.split("\n") },
    });
  }
  if (tests?.trim()) {
    event.push({
      listen: "test",
      script: { type: "text/javascript", exec: tests.split("\n") },
    });
  }
  return event.length ? event : undefined;
}

function applyParentMeta(
  item: PostmanItem,
  config?: Pick<FolderConfig, "auth" | "variables" | "preRequestScript" | "tests">,
): PostmanItem {
  if (!config) return item;
  const auth = toPostmanAuth(config.auth);
  const variable = toPostmanKeyValues(config.variables);
  const event = toPostmanEvents(config.preRequestScript, config.tests);
  return {
    ...item,
    ...(auth ? { auth } : {}),
    ...(variable.length ? { variable } : {}),
    ...(event ? { event } : {}),
  };
}

function toPostmanBody(request: ApiRequest): PostmanRequest["body"] | undefined {
  if (request.bodyKind === "none") return undefined;

  if (request.bodyKind === "graphql") {
    return {
      mode: "graphql",
      graphql: {
        query: request.graphqlQuery,
        variables: request.graphqlVariables,
      },
    };
  }

  if (request.bodyKind === "form") {
    return {
      mode: "urlencoded",
      urlencoded: toPostmanKeyValues(request.form),
    };
  }

  if (request.bodyKind === "multipart") {
    return {
      mode: "formdata",
      formdata: request.multipart
        .filter((field) => field.key.trim() || field.value.trim() || field.fileName)
        .map((field) => ({
          key: field.key,
          value: field.fieldType === "file" ? field.fileName ?? "" : field.value,
          type: field.fieldType === "file" ? "file" : "text",
          ...(field.enabled ? {} : { disabled: true }),
        })),
    };
  }

  return {
    mode: "raw",
    raw: request.body,
  };
}

function toPostmanRequest(saved: SavedRequest): PostmanItem {
  const request = saved.request;
  const query = toPostmanKeyValues(request.query);
  const pathParams = toPostmanKeyValues(request.pathParams);
  const body = toPostmanBody(request);
  const auth = toPostmanAuth(request.auth);
  const url =
    query.length > 0 || pathParams.length > 0
      ? {
          raw: request.url,
          ...(query.length ? { query } : {}),
          ...(pathParams.length ? { variable: pathParams } : {}),
        }
      : request.url;
  const postmanRequest: PostmanRequest = {
    method: request.bodyKind === "graphql" ? "POST" : request.method,
    header: toPostmanKeyValues(request.headers),
    url,
    ...(body ? { body } : {}),
    ...(auth ? { auth } : {}),
  };

  const item: PostmanItem = {
    name: saved.name,
    request: postmanRequest,
  };

  const event = toPostmanEvents(request.preRequestScript, request.tests);
  if (event) item.event = event;

  return item;
}

function folderToPostmanItem(
  folder: ReturnType<typeof groupRequestsByFolder>["folders"][number],
  folderConfigs: FolderConfig[],
): PostmanItem {
  const children: PostmanItem[] = [
    ...folder.requests.map(toPostmanRequest),
    ...folder.children.map((child) => folderToPostmanItem(child, folderConfigs)),
  ];

  return applyParentMeta(
    {
      name: folder.name,
      item: children,
    },
    folderConfigs.find((item) => item.path === folder.path),
  );
}

export function exportPostmanCollection(group: CollectionGroup, requests: SavedRequest[]): string {
  const grouped = groupRequestsByFolder(requests, group.folders);
  const folderConfigs = group.folderConfigs ?? [];
  const items: PostmanItem[] = [
    ...grouped.root.map(toPostmanRequest),
    ...grouped.folders.map((folder) => folderToPostmanItem(folder, folderConfigs)),
  ];

  const collection: PostmanCollection = {
    info: {
      _postman_id: crypto.randomUUID(),
      name: group.name,
      schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    },
    item: items,
  };

  const auth = toPostmanAuth(group.auth);
  const variable = toPostmanKeyValues(group.variables);
  const event = toPostmanEvents(group.preRequestScript, group.tests);
  if (auth) collection.auth = auth;
  if (variable.length) collection.variable = variable;
  if (event) collection.event = event;

  return JSON.stringify(collection, null, 2);
}
