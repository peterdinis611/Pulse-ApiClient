import type {
  ApiRequest,
  AuthConfig,
  BodyKind,
  Environment,
  HistoryEntry,
  HttpMethod,
  KeyValue,
  SavedRequest,
} from "../types";
import { defaultGraphqlQuery, defaultGraphqlVariables } from "./graphql";
import { defaultRequestTests } from "./default-tests";
import { inferProtocolFromUrl } from "./protocol";

export function createId(prefix = "id"): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function createKeyValue(partial?: Partial<KeyValue>): KeyValue {
  return {
    id: createId("kv"),
    key: "",
    value: "",
    enabled: true,
    ...partial,
  };
}

export function defaultAuth(): AuthConfig {
  return {
    authType: "none",
    bearerToken: "",
    basicUsername: "",
    basicPassword: "",
    apiKeyKey: "",
    apiKeyValue: "",
    apiKeyIn: "header",
  };
}

export function createRequest(partial?: Partial<ApiRequest>): ApiRequest {
  const auth = { ...defaultAuth(), ...partial?.auth };

  return {
    id: partial?.id ?? createId("req"),
    name: partial?.name ?? "Untitled Request",
    protocol: partial?.protocol ?? inferProtocolFromUrl(partial?.url ?? "https://httpbin.org/get"),
    method: partial?.method ?? "GET",
    url: partial?.url ?? "https://httpbin.org/get",
    headers: partial?.headers ?? [createKeyValue({ key: "Accept", value: "application/json" })],
    query: partial?.query ?? [createKeyValue()],
    bodyKind: partial?.bodyKind ?? "none",
    body: partial?.body ?? '{\n  \n}',
    graphqlQuery: partial?.graphqlQuery ?? defaultGraphqlQuery(),
    graphqlVariables: partial?.graphqlVariables ?? defaultGraphqlVariables(),
    graphqlOperationName: partial?.graphqlOperationName ?? "",
    form: partial?.form ?? [createKeyValue()],
    multipart: partial?.multipart ?? [
      {
        id: createId("mp"),
        key: "",
        value: "",
        enabled: true,
        fieldType: "text",
      },
    ],
    auth,
    tests: partial?.tests ?? defaultRequestTests,
  };
}

export function createEnvironment(name = "Local"): Environment {
  return {
    id: createId("env"),
    name,
    variables: [
      createKeyValue({ key: "baseUrl", value: "http://localhost:3000" }),
      createKeyValue({ key: "token", value: "" }),
    ],
  };
}

export function createSavedRequest(
  request: ApiRequest,
  options?: { collectionId?: string; folder?: string; name?: string },
): SavedRequest {
  return {
    id: createId("saved"),
    name: options?.name ?? request.name,
    collectionId: options?.collectionId ?? createId("col"),
    folder: options?.folder,
    request,
  };
}

export function createHistoryEntry(
  request: ApiRequest,
  response?: HistoryEntry["response"],
): HistoryEntry {
  return {
    id: createId("hist"),
    sentAt: new Date().toISOString(),
    request: structuredClone(request),
    response,
  };
}

export function methodClass(method: HttpMethod): string {
  return `method-${method.toLowerCase()}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function prettyJson(value: string): string {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

export function bodyKindForMethod(method: HttpMethod, current: BodyKind): BodyKind {
  if (method === "GET" || method === "HEAD") {
    return current === "graphql" ? "graphql" : "none";
  }
  return current;
}
