import { invoke } from "@tauri-apps/api/core";
import type { ApiRequest, AppSettings, HttpEngineStats, HttpResponse, TestRunResult } from "../types";
import { substituteVariables } from "./env";
import type { Environment } from "../types";
import { buildGraphqlBody } from "./graphql";
import { normalizeRequest } from "./helpers";

function enabledPairs(items: Array<{ key: string; value: string; enabled: boolean }>) {
  return items
    .filter((item) => item.enabled && item.key.trim())
    .map((item) => ({
      key: item.key.trim(),
      value: item.value,
      enabled: true,
    }));
}

export function prepareRequest(request: ApiRequest, environment: Environment | null): ApiRequest {
  const normalized = normalizeRequest(request);
  const prepared: ApiRequest = {
    ...normalized,
    url: substituteVariables(normalized.url, environment),
    headers: normalized.headers.map((item) => ({
      ...item,
      key: substituteVariables(item.key, environment),
      value: substituteVariables(item.value, environment),
    })),
    query: normalized.query.map((item) => ({
      ...item,
      key: substituteVariables(item.key, environment),
      value: substituteVariables(item.value, environment),
    })),
    body: substituteVariables(normalized.body, environment),
    graphqlQuery: substituteVariables(normalized.graphqlQuery, environment),
    graphqlVariables: substituteVariables(normalized.graphqlVariables, environment),
    graphqlOperationName: substituteVariables(normalized.graphqlOperationName, environment),
    form: normalized.form.map((item) => ({
      ...item,
      key: substituteVariables(item.key, environment),
      value: substituteVariables(item.value, environment),
    })),
    multipart: normalized.multipart.map((item) => ({
      ...item,
      key: substituteVariables(item.key, environment),
      value: substituteVariables(item.value, environment),
    })),
    auth: {
      ...normalized.auth,
      bearerToken: substituteVariables(normalized.auth.bearerToken, environment),
      basicUsername: substituteVariables(normalized.auth.basicUsername, environment),
      basicPassword: substituteVariables(normalized.auth.basicPassword, environment),
      apiKeyKey: substituteVariables(normalized.auth.apiKeyKey, environment),
      apiKeyValue: substituteVariables(normalized.auth.apiKeyValue, environment),
    },
  };

  if (prepared.bodyKind === "graphql") {
    prepared.body = buildGraphqlBody(prepared);
  }

  return prepared;
}

function buildPayload(prepared: ApiRequest, options?: { requestId?: string; timeoutMs?: number }) {
  return {
    method: prepared.method,
    url: prepared.url,
    headers: enabledPairs(prepared.headers),
    query: enabledPairs(prepared.query),
    bodyKind: prepared.bodyKind,
    body: prepared.body,
    form: enabledPairs(prepared.form),
    multipart: prepared.multipart
      .filter((item) => item.enabled && item.key.trim())
      .map((item) => ({
        key: item.key.trim(),
        enabled: true,
        fieldType: item.fieldType,
        value: item.value,
        fileName: item.fileName ?? null,
        mimeType: item.mimeType ?? null,
      })),
    auth: {
      authType: prepared.auth.authType,
      bearerToken: prepared.auth.bearerToken,
      basicUsername: prepared.auth.basicUsername,
      basicPassword: prepared.auth.basicPassword,
      apiKeyKey: prepared.auth.apiKeyKey,
      apiKeyValue: prepared.auth.apiKeyValue,
      apiKeyIn: prepared.auth.apiKeyIn,
    },
    requestId: options?.requestId ?? null,
    timeoutMs: options?.timeoutMs ?? null,
  };
}

export async function sendRequest(
  request: ApiRequest,
  environment: Environment | null,
  options?: { requestId?: string; timeoutMs?: number },
): Promise<HttpResponse> {
  const prepared = prepareRequest(request, environment);
  return invoke<HttpResponse>("send_http_request", {
    payload: buildPayload(prepared, options),
  });
}

export async function sendRequestsBatch(
  requests: Array<{ request: ApiRequest; environment: Environment | null; requestId?: string }>,
): Promise<Array<{ response?: HttpResponse; error?: string }>> {
  const payloads = requests.map(({ request, environment, requestId }) =>
    buildPayload(prepareRequest(request, environment), { requestId }),
  );

  const results = await invoke<Array<{ response?: HttpResponse; error?: string }>>(
    "send_http_requests_batch",
    { payloads },
  );

  return results;
}

export async function cancelHttpRequest(requestId: string): Promise<boolean> {
  return invoke<boolean>("cancel_http_request", { requestId });
}

export async function cancelAllHttpRequests(): Promise<number> {
  return invoke<number>("cancel_all_http_requests");
}

export async function getHttpEngineStats(): Promise<HttpEngineStats> {
  return invoke<HttpEngineStats>("get_http_engine_stats");
}

export async function runHttpTests(script: string, response: HttpResponse): Promise<TestRunResult> {
  return invoke<TestRunResult>("run_http_tests", { script, response });
}

export async function getAppSettings(): Promise<AppSettings> {
  return invoke<AppSettings>("get_app_settings");
}

export async function setHttpSettings(
  httpMaxConcurrent: number,
  httpTimeoutMs: number,
  httpCacheEnabled: boolean,
  httpCacheTtlSec: number,
  httpCacheDiskEnabled: boolean,
): Promise<AppSettings> {
  return invoke<AppSettings>("set_http_settings", {
    httpMaxConcurrent,
    httpTimeoutMs,
    httpCacheEnabled,
    httpCacheTtlSec,
    httpCacheDiskEnabled,
  });
}

export async function clearHttpCache(): Promise<number> {
  return invoke<number>("clear_http_cache");
}

export type StoredCookie = {
  name: string;
  value: string;
  domain?: string | null;
  path?: string | null;
  url: string;
};

export async function getHttpCookies(): Promise<StoredCookie[]> {
  return invoke<StoredCookie[]>("get_http_cookies");
}

export async function clearHttpCookies(): Promise<void> {
  await invoke("clear_http_cookies");
}
