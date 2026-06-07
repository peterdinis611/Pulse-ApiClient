import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { ApiRequest, MainView } from "@/types";

export type AppWindowInfo = {
  label: string;
  title: string;
  isMain: boolean;
};

export type PendingWindowInit = {
  mainView?: MainView | null;
  initialRequest?: ApiRequest | null;
};

export async function getCurrentWindowLabel(): Promise<string> {
  return getCurrentWindow().label;
}

export async function createAppWindow(options?: {
  title?: string;
  mainView?: MainView;
  initialRequest?: ApiRequest;
}): Promise<AppWindowInfo> {
  return invoke<AppWindowInfo>("create_app_window", {
    title: options?.title ?? null,
    mainView: options?.mainView ?? null,
    initialRequest: options?.initialRequest ?? null,
  });
}

export async function listAppWindows(): Promise<AppWindowInfo[]> {
  return invoke<AppWindowInfo[]>("list_app_windows");
}

export async function focusAppWindow(label: string): Promise<void> {
  await invoke("focus_app_window", { label });
}

export async function closeAppWindow(label: string): Promise<void> {
  await invoke("close_app_window", { label });
}

export async function takePendingWindowInit(label: string): Promise<PendingWindowInit | null> {
  return invoke<PendingWindowInit | null>("take_pending_window_init", { label });
}

export async function setWindowTitle(label: string, title: string): Promise<void> {
  await invoke("set_window_title", { label, title });
}

export async function openRequestInNewWindow(request: ApiRequest): Promise<AppWindowInfo> {
  const title = request.name.trim() || `${request.method} request`;
  return createAppWindow({
    title: `${title} · Pulse`,
    mainView: "request",
    initialRequest: structuredClone(request),
  });
}

export async function openOverviewWindow(): Promise<AppWindowInfo> {
  return createAppWindow({
    title: "Overview · Pulse",
    mainView: "overview",
  });
}
