import { groupRequestsByFolder } from "./collections";
import type { ApiRequest, AuthConfig, CollectionGroup, KeyValue, SavedRequest } from "@/types";

type PostmanKeyValue = {
  key: string;
  value: string;
  disabled?: boolean;
};

type PostmanItem = {
  name: string;
  item?: PostmanItem[];
  request?: PostmanRequest;
  event?: Array<{
    listen: string;
    script: { type: string; exec: string[] };
  }>;
};

type PostmanRequest = {
  method: string;
  header: PostmanKeyValue[];
  url: string | { raw: string; query?: PostmanKeyValue[] };
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
};

function toPostmanKeyValues(items: KeyValue[]): PostmanKeyValue[] {
  return items
    .filter((item) => item.key.trim() || item.value.trim())
    .map((item) => ({
      key: item.key,
      value: item.value,
      ...(item.enabled ? {} : { disabled: true }),
    }));
}

function toPostmanAuth(auth: AuthConfig): PostmanRequest["auth"] | undefined {
  if (auth.authType === "none") return undefined;

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

  return {
    type: "apikey",
    apikey: [
      { key: "key", value: auth.apiKeyKey, type: "string" },
      { key: "value", value: auth.apiKeyValue, type: "string" },
      { key: "in", value: auth.apiKeyIn, type: "string" },
    ],
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
  const body = toPostmanBody(request);
  const auth = toPostmanAuth(request.auth);
  const postmanRequest: PostmanRequest = {
    method: request.bodyKind === "graphql" ? "POST" : request.method,
    header: toPostmanKeyValues(request.headers),
    url:
      query.length > 0
        ? {
            raw: request.url,
            query,
          }
        : request.url,
    ...(body ? { body } : {}),
    ...(auth ? { auth } : {}),
  };

  const item: PostmanItem = {
    name: saved.name,
    request: postmanRequest,
  };

  if (request.tests.trim()) {
    item.event = [
      {
        listen: "test",
        script: {
          type: "text/javascript",
          exec: request.tests.split("\n"),
        },
      },
    ];
  }

  return item;
}

function folderToPostmanItem(folder: ReturnType<typeof groupRequestsByFolder>["folders"][number]): PostmanItem {
  const children: PostmanItem[] = [
    ...folder.requests.map(toPostmanRequest),
    ...folder.children.map(folderToPostmanItem),
  ];

  return {
    name: folder.name,
    item: children,
  };
}

export function exportPostmanCollection(group: CollectionGroup, requests: SavedRequest[]): string {
  const grouped = groupRequestsByFolder(requests, group.folders);
  const items: PostmanItem[] = [
    ...grouped.root.map(toPostmanRequest),
    ...grouped.folders.map(folderToPostmanItem),
  ];

  const collection: PostmanCollection = {
    info: {
      _postman_id: crypto.randomUUID(),
      name: group.name,
      schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    },
    item: items,
  };

  return JSON.stringify(collection, null, 2);
}
