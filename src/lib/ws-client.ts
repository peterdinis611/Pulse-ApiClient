import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { ApiRequest, Environment, HttpResponse } from "@/types";
import { prepareRequest } from "./http-client";

export type WsConnectResult = {
  connectionId: string;
  status: number;
  headers: HttpResponse["headers"];
};

export type WsMessageEvent = {
  connectionId: string;
  tabId: string;
  data: string;
  binary: boolean;
  timestamp: number;
};

export type WsCloseEvent = {
  connectionId: string;
  tabId: string;
  code?: number;
  reason?: string;
};

export type WsErrorEvent = {
  connectionId: string;
  tabId: string;
  message: string;
};

function buildWsPayload(request: ApiRequest, environment: Environment | null) {
  const prepared = prepareRequest(request, environment);
  return {
    method: prepared.method,
    url: prepared.url,
    headers: prepared.headers
      .filter((item) => item.enabled && item.key.trim())
      .map((item) => ({ key: item.key.trim(), value: item.value, enabled: true })),
    query: prepared.query
      .filter((item) => item.enabled && item.key.trim())
      .map((item) => ({ key: item.key.trim(), value: item.value, enabled: true })),
    bodyKind: prepared.bodyKind,
    body: prepared.body,
    form: prepared.form
      .filter((item) => item.enabled && item.key.trim())
      .map((item) => ({ key: item.key.trim(), value: item.value, enabled: true })),
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
    useCache: false,
    requestId: null,
    timeoutMs: null,
  };
}

export async function wsConnect(
  tabId: string,
  request: ApiRequest,
  environment: Environment | null,
): Promise<WsConnectResult> {
  return invoke<WsConnectResult>("ws_connect", {
    tabId,
    payload: buildWsPayload(request, environment),
  });
}

export async function wsSend(
  connectionId: string,
  data: string,
  binary = false,
): Promise<void> {
  await invoke("ws_send", { connectionId, data, binary });
}

export async function wsPing(connectionId: string): Promise<void> {
  await invoke("ws_ping", { connectionId });
}

export async function wsClose(connectionId: string): Promise<void> {
  await invoke("ws_close", { connectionId });
}

export async function listenWsMessage(handler: (event: WsMessageEvent) => void) {
  return listen<WsMessageEvent>("ws-message", (event) => handler(event.payload));
}

export async function listenWsClose(handler: (event: WsCloseEvent) => void) {
  return listen<WsCloseEvent>("ws-close", (event) => handler(event.payload));
}

export async function listenWsError(handler: (event: WsErrorEvent) => void) {
  return listen<WsErrorEvent>("ws-error", (event) => handler(event.payload));
}
