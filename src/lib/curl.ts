import { invoke } from "@tauri-apps/api/core";
import { prepareRequestAsync } from "./http-client";
import { createKeyValue, createRequest, defaultAuth } from "./helpers";
import { canUseTauriIpc } from "./tauri-runtime";
import type { ApiRequest, AuthConfig, BodyKind, Environment, HttpMethod, MultipartField } from "@/types";

type NativeCurlPayload = {
  method: string;
  url: string;
  headers: Array<{ key: string; value: string; enabled?: boolean }>;
  query: Array<{ key: string; value: string; enabled?: boolean }>;
  bodyKind: string;
  body: string;
  form: Array<{ key: string; value: string; enabled?: boolean }>;
  multipart: Array<{
    key: string;
    enabled?: boolean;
    fieldType?: string;
    value?: string;
    fileName?: string | null;
    mimeType?: string | null;
  }>;
  auth: {
    authType?: string;
    bearerToken?: string | null;
    basicUsername?: string | null;
    basicPassword?: string | null;
    apiKeyKey?: string | null;
    apiKeyValue?: string | null;
    apiKeyIn?: string | null;
  };
};

function requireTauri(): void {
  if (!canUseTauriIpc()) {
    throw new Error("cURL convert requires the desktop app");
  }
}

function payloadToRequest(payload: NativeCurlPayload): ApiRequest {
  const auth: AuthConfig = {
    ...defaultAuth(),
    authType: (payload.auth?.authType as AuthConfig["authType"]) || "none",
    bearerToken: payload.auth?.bearerToken ?? "",
    basicUsername: payload.auth?.basicUsername ?? "",
    basicPassword: payload.auth?.basicPassword ?? "",
    apiKeyKey: payload.auth?.apiKeyKey ?? "",
    apiKeyValue: payload.auth?.apiKeyValue ?? "",
    apiKeyIn: (payload.auth?.apiKeyIn as AuthConfig["apiKeyIn"]) || "header",
  };
  return createRequest({
    method: (payload.method || "GET").toUpperCase() as HttpMethod,
    url: payload.url,
    headers: (payload.headers ?? []).map((item) =>
      createKeyValue({ key: item.key, value: item.value, enabled: item.enabled ?? true }),
    ),
    query: (payload.query ?? []).map((item) =>
      createKeyValue({ key: item.key, value: item.value, enabled: item.enabled ?? true }),
    ),
    bodyKind: (payload.bodyKind || "none") as BodyKind,
    body: payload.body || "{\n  \n}",
    form: (payload.form ?? []).map((item) =>
      createKeyValue({ key: item.key, value: item.value, enabled: item.enabled ?? true }),
    ),
    multipart: (payload.multipart ?? []).map((item) => ({
      id: crypto.randomUUID(),
      key: item.key,
      enabled: item.enabled ?? true,
      fieldType: (item.fieldType === "file" ? "file" : "text") as MultipartField["fieldType"],
      value: item.value ?? "",
      fileName: item.fileName ?? undefined,
      mimeType: item.mimeType ?? undefined,
    })),
    auth,
  });
}

function requestToNativePayload(request: ApiRequest): NativeCurlPayload {
  return {
    method: request.method,
    url: request.url,
    headers: request.headers.filter((item) => item.enabled && item.key.trim()),
    query: request.query.filter((item) => item.enabled && item.key.trim()),
    bodyKind: request.bodyKind,
    body: request.body,
    form: request.form.filter((item) => item.enabled && item.key.trim()),
    multipart: request.multipart
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
      authType: request.auth.authType === "inherit" ? "none" : request.auth.authType,
      bearerToken: request.auth.bearerToken,
      basicUsername: request.auth.basicUsername,
      basicPassword: request.auth.basicPassword,
      apiKeyKey: request.auth.apiKeyKey,
      apiKeyValue: request.auth.apiKeyValue,
      apiKeyIn: request.auth.apiKeyIn,
    },
  };
}

/** Parse cURL via pulse-core (`parse_curl`). Desktop-only. */
export async function curlToRequestAsync(raw: string): Promise<ApiRequest> {
  requireTauri();
  const payload = await invoke<NativeCurlPayload>("parse_curl", { command: raw });
  return payloadToRequest(payload);
}

/** Format cURL via pulse-core (`format_curl`). Desktop-only. */
export async function requestToCurlAsync(
  request: ApiRequest,
  environment: Environment | null = null,
): Promise<string> {
  requireTauri();
  const prepared = await prepareRequestAsync(request, environment);
  return invoke<string>("format_curl", { payload: requestToNativePayload(prepared) });
}
