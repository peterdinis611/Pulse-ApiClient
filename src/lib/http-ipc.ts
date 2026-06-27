import type { AppSettings, HttpEngineStats, HttpResponse, TestRunResult } from "../types";
import { invokeEffect, invokeEffectVoid } from "./effect/tauri";
import { runEffect, runParallelAll } from "./effect/run";

export type StoredCookie = {
  name: string;
  value: string;
  domain?: string | null;
  path?: string | null;
  url: string;
};

export function sendRequestEffect(
  payload: Record<string, unknown>,
): ReturnType<typeof invokeEffect<HttpResponse>> {
  return invokeEffect<HttpResponse>("send_http_request", { payload });
}

export function sendRequestsBatchEffect(
  payloads: Record<string, unknown>[],
): ReturnType<typeof invokeEffect<Array<{ response?: HttpResponse; error?: string }>>> {
  return invokeEffect<Array<{ response?: HttpResponse; error?: string }>>("send_http_requests_batch", {
    payloads,
  });
}

export function runHttpTestsEffect(
  script: string,
  response: HttpResponse,
): ReturnType<typeof invokeEffect<TestRunResult>> {
  return invokeEffect<TestRunResult>("run_http_tests", { script, response });
}

export function getAppSettingsEffect(): ReturnType<typeof invokeEffect<AppSettings>> {
  return invokeEffect<AppSettings>("get_app_settings");
}

export function getHttpEngineStatsEffect(): ReturnType<typeof invokeEffect<HttpEngineStats>> {
  return invokeEffect<HttpEngineStats>("get_http_engine_stats");
}

export function getHttpCookiesEffect(): ReturnType<typeof invokeEffect<StoredCookie[]>> {
  return invokeEffect<StoredCookie[]>("get_http_cookies");
}

export function loadHttpSettingsDashboardEffect() {
  return runParallelAll([
    getAppSettingsEffect(),
    getHttpEngineStatsEffect(),
    getHttpCookiesEffect(),
  ] as const);
}

export async function loadHttpSettingsDashboard() {
  const [settings, stats, cookies] = await loadHttpSettingsDashboardEffect();
  return { settings, stats, cookies };
}

export async function cancelHttpRequest(requestId: string): Promise<boolean> {
  return runEffect(invokeEffect<boolean>("cancel_http_request", { requestId }));
}

export async function cancelAllHttpRequests(): Promise<number> {
  return runEffect(invokeEffect<number>("cancel_all_http_requests"));
}

export async function setHttpSettings(
  httpMaxConcurrent: number,
  httpTimeoutMs: number,
  httpCacheEnabled: boolean,
  httpCacheTtlSec: number,
  httpCacheDiskEnabled: boolean,
): Promise<AppSettings> {
  return runEffect(
    invokeEffect<AppSettings>("set_http_settings", {
      httpMaxConcurrent,
      httpTimeoutMs,
      httpCacheEnabled,
      httpCacheTtlSec,
      httpCacheDiskEnabled,
    }),
  );
}

export async function clearHttpCache(): Promise<number> {
  return runEffect(invokeEffect<number>("clear_http_cache"));
}

export async function clearHttpCookies(): Promise<void> {
  return runEffect(invokeEffectVoid("clear_http_cookies"));
}

export async function getAppSettings(): Promise<AppSettings> {
  return runEffect(getAppSettingsEffect());
}

export async function getHttpEngineStats(): Promise<HttpEngineStats> {
  return runEffect(getHttpEngineStatsEffect());
}

export async function getHttpCookies(): Promise<StoredCookie[]> {
  return runEffect(getHttpCookiesEffect());
}

export async function runHttpTests(script: string, response: HttpResponse): Promise<TestRunResult> {
  return runEffect(runHttpTestsEffect(script, response));
}
