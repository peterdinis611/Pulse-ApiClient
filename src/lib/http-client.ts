import type { ApiRequest, Environment, HttpResponse } from "../types";
import { substituteVariables } from "./env";
import { buildGraphqlBody } from "./graphql";
import { normalizeRequest } from "./helpers";
import { runEffect } from "./effect/run";
import {
  cancelAllHttpRequests,
  cancelHttpRequest,
  clearHttpCache,
  clearHttpCookies,
  getAppSettings,
  getHttpCookies,
  getHttpEngineStats,
  loadHttpSettingsDashboard,
  runHttpTests,
  sendRequestEffect,
  sendRequestsBatchEffect,
  setHttpSettings,
  type StoredCookie,
} from "./http-ipc";

export {
  cancelAllHttpRequests,
  cancelHttpRequest,
  clearHttpCache,
  clearHttpCookies,
  getAppSettings,
  getHttpCookies,
  getHttpEngineStats,
  loadHttpSettingsDashboard,
  runHttpTests,
  setHttpSettings,
  type StoredCookie,
};

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
  return runEffect(sendRequestEffect(buildPayload(prepared, options)));
}

export async function sendRequestsBatch(
  requests: Array<{ request: ApiRequest; environment: Environment | null; requestId?: string }>,
): Promise<Array<{ response?: HttpResponse; error?: string }>> {
  const payloads = requests.map(({ request, environment, requestId }) =>
    buildPayload(prepareRequest(request, environment), { requestId }),
  );

  return runEffect(sendRequestsBatchEffect(payloads));
}
