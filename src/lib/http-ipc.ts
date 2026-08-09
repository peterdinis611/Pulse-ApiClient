import type { AppSettings, HttpEngineStats, HttpResponse, HttpSettings, TestRunResult } from "../types";
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

export async function setHttpSettings(settings: HttpSettings): Promise<AppSettings> {
  return runEffect(
    invokeEffect<AppSettings>("set_http_settings", {
      settings,
    }),
  );
}

export async function clearHttpCache(): Promise<number> {
  return runEffect(invokeEffect<number>("clear_http_cache"));
}

export async function clearHttpCookies(): Promise<void> {
  return runEffect(invokeEffectVoid("clear_http_cookies"));
}

export async function setHttpCookie(cookie: StoredCookie): Promise<StoredCookie[]> {
  return runEffect(invokeEffect<StoredCookie[]>("set_http_cookie", { cookie }));
}

export async function deleteHttpCookie(name: string, url: string): Promise<StoredCookie[]> {
  return runEffect(invokeEffect<StoredCookie[]>("delete_http_cookie", { name, url }));
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

export type EnvMutation = {
  key: string;
  value: string;
};

export type PreRequestResult = {
  mutations: EnvMutation[];
};

export function runPreRequestScriptEffect(
  script: string,
): ReturnType<typeof invokeEffect<PreRequestResult>> {
  return invokeEffect<PreRequestResult>("run_pre_request_script", { script });
}

export async function runPreRequestScript(script: string): Promise<PreRequestResult> {
  return runEffect(runPreRequestScriptEffect(script));
}

export type OAuthTokenRequest = {
  grantType: string;
  tokenUrl: string;
  clientId: string;
  clientSecret?: string | null;
  scope?: string | null;
  code?: string | null;
  redirectUri?: string | null;
  codeVerifier?: string | null;
  refreshToken?: string | null;
};

export type OAuthTokenResponse = {
  accessToken: string;
  refreshToken?: string | null;
  tokenType?: string | null;
  expiresIn?: number | null;
  scope?: string | null;
};

export async function exchangeOAuthToken(request: OAuthTokenRequest): Promise<OAuthTokenResponse> {
  return runEffect(invokeEffect<OAuthTokenResponse>("exchange_oauth_token", { request }));
}
