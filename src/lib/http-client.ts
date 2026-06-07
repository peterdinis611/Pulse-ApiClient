import { invoke } from "@tauri-apps/api/core";
import type { ApiRequest, HttpEngineStats, HttpResponse } from "../types";
import { substituteVariables } from "./env";
import type { Environment } from "../types";
import { buildGraphqlBody } from "./graphql";

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
  const prepared: ApiRequest = {
    ...request,
    url: substituteVariables(request.url, environment),
    headers: request.headers.map((item) => ({
      ...item,
      key: substituteVariables(item.key, environment),
      value: substituteVariables(item.value, environment),
    })),
    query: request.query.map((item) => ({
      ...item,
      key: substituteVariables(item.key, environment),
      value: substituteVariables(item.value, environment),
    })),
    body: substituteVariables(request.body, environment),
    graphqlQuery: substituteVariables(request.graphqlQuery, environment),
    graphqlVariables: substituteVariables(request.graphqlVariables, environment),
    graphqlOperationName: substituteVariables(request.graphqlOperationName, environment),
    form: request.form.map((item) => ({
      ...item,
      key: substituteVariables(item.key, environment),
      value: substituteVariables(item.value, environment),
    })),
    multipart: request.multipart.map((item) => ({
      ...item,
      key: substituteVariables(item.key, environment),
      value: substituteVariables(item.value, environment),
    })),
    auth: {
      ...request.auth,
      bearerToken: substituteVariables(request.auth.bearerToken, environment),
      basicUsername: substituteVariables(request.auth.basicUsername, environment),
      basicPassword: substituteVariables(request.auth.basicPassword, environment),
      apiKeyKey: substituteVariables(request.auth.apiKeyKey, environment),
      apiKeyValue: substituteVariables(request.auth.apiKeyValue, environment),
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

export async function setHttpSettings(
  httpMaxConcurrent: number,
  httpTimeoutMs: number,
): Promise<void> {
  await invoke("set_http_settings", { httpMaxConcurrent, httpTimeoutMs });
}

export async function clearHttpCache(): Promise<number> {
  return invoke<number>("clear_http_cache");
}
