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
    oauthGrantType: "client_credentials",
    oauthTokenUrl: "",
    oauthAuthorizeUrl: "",
    oauthClientId: "",
    oauthClientSecret: "",
    oauthScope: "",
    oauthRedirectUri: "http://127.0.0.1:8080/callback",
    oauthRefreshToken: "",
    oauthCodeVerifier: "",
    oauthAuthCode: "",
  };
}

function normalizeKeyValues(items: KeyValue[] | undefined, fallback: KeyValue[]): KeyValue[] {
  if (!items?.length) return fallback;
  return items.map((item) => ({
    id: item.id ?? createId("kv"),
    key: item.key ?? "",
    value: item.value ?? "",
    enabled: item.enabled ?? true,
  }));
}

function normalizeAuth(partial?: Partial<AuthConfig>): AuthConfig {
  const base = defaultAuth();
  return {
    ...base,
    ...partial,
    authType: partial?.authType ?? base.authType,
    bearerToken: partial?.bearerToken ?? base.bearerToken,
    basicUsername: partial?.basicUsername ?? base.basicUsername,
    basicPassword: partial?.basicPassword ?? base.basicPassword,
    apiKeyKey: partial?.apiKeyKey ?? base.apiKeyKey,
    apiKeyValue: partial?.apiKeyValue ?? base.apiKeyValue,
    apiKeyIn: partial?.apiKeyIn ?? base.apiKeyIn,
    oauthGrantType: partial?.oauthGrantType ?? base.oauthGrantType,
    oauthTokenUrl: partial?.oauthTokenUrl ?? base.oauthTokenUrl,
    oauthAuthorizeUrl: partial?.oauthAuthorizeUrl ?? base.oauthAuthorizeUrl,
    oauthClientId: partial?.oauthClientId ?? base.oauthClientId,
    oauthClientSecret: partial?.oauthClientSecret ?? base.oauthClientSecret,
    oauthScope: partial?.oauthScope ?? base.oauthScope,
    oauthRedirectUri: partial?.oauthRedirectUri ?? base.oauthRedirectUri,
    oauthRefreshToken: partial?.oauthRefreshToken ?? base.oauthRefreshToken,
    oauthCodeVerifier: partial?.oauthCodeVerifier ?? base.oauthCodeVerifier,
    oauthAuthCode: partial?.oauthAuthCode ?? base.oauthAuthCode,
  };
}

export function normalizeRequest(partial?: Partial<ApiRequest>): ApiRequest {
  return createRequest(partial);
}

export function createRequest(partial?: Partial<ApiRequest>): ApiRequest {
  const defaultHeaders = [createKeyValue({ key: "Accept", value: "application/json" })];

  return {
    id: partial?.id ?? createId("req"),
    name: partial?.name ?? "Untitled Request",
    protocol:
      partial?.protocol ?? inferProtocolFromUrl(partial?.url ?? "https://httpbin.org/get"),
    method: partial?.method ?? "GET",
    url: partial?.url ?? "https://httpbin.org/get",
    headers: normalizeKeyValues(partial?.headers, defaultHeaders),
    query: normalizeKeyValues(partial?.query, [createKeyValue()]),
    bodyKind: partial?.bodyKind ?? "none",
    body: partial?.body ?? '{\n  \n}',
    graphqlQuery: partial?.graphqlQuery ?? defaultGraphqlQuery(),
    graphqlVariables: partial?.graphqlVariables ?? defaultGraphqlVariables(),
    graphqlOperationName: partial?.graphqlOperationName ?? "",
    form: normalizeKeyValues(partial?.form, [createKeyValue()]),
    multipart:
      partial?.multipart?.map((item) => ({
        id: item.id ?? createId("mp"),
        key: item.key ?? "",
        value: item.value ?? "",
        enabled: item.enabled ?? true,
        fieldType: item.fieldType ?? "text",
        fileName: item.fileName,
        mimeType: item.mimeType,
      })) ?? [
        {
          id: createId("mp"),
          key: "",
          value: "",
          enabled: true,
          fieldType: "text",
        },
      ],
    auth: normalizeAuth(partial?.auth),
    tests: partial?.tests ?? defaultRequestTests,
    preRequestScript: partial?.preRequestScript ?? "",
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

export function isKeyValueBlank(row: KeyValue): boolean {
  return !row.key.trim() && !row.value.trim();
}

/** Keep a blank trailing row so params/headers can be typed without clicking Add. */
export function ensureTrailingBlankKeyValue(rows: KeyValue[]): KeyValue[] {
  const last = rows[rows.length - 1];
  if (!last || !isKeyValueBlank(last)) {
    return [...rows, createKeyValue()];
  }
  return rows;
}
