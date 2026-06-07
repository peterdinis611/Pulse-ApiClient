import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { canUseTauriIpc } from "@/lib/tauri-runtime";
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

function createWindowLabel(): string {
  return `pulse-${Date.now().toString(16)}`;
}

function resolveWindowUrl(): string {
  if (import.meta.env.DEV) {
    return `${window.location.origin}/`;
  }

  return "index.html";
}

export async function getCurrentWindowLabel(): Promise<string> {
  if (!canUseTauriIpc()) return "main";
  return getCurrentWindow().label;
}

async function registerPendingWindowInit(
  label: string,
  options?: {
    mainView?: MainView;
    initialRequest?: ApiRequest;
  },
): Promise<void> {
  if (!options?.mainView && !options?.initialRequest) return;

  await invoke("register_pending_window_init", {
    label,
    mainView: options.mainView ?? null,
    initialRequest: options.initialRequest ?? null,
  });
}

async function openWebviewWindow(label: string, title: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const webview = new WebviewWindow(label, {
      url: resolveWindowUrl(),
      title,
      width: 1280,
      height: 840,
      minWidth: 960,
      minHeight: 640,
      center: true,
    });

    webview.once("tauri://created", () => resolve());
    webview.once("tauri://error", (error) => {
      reject(error instanceof Error ? error : new Error(String(error)));
    });
  });
}

export async function createAppWindow(options?: {
  title?: string;
  mainView?: MainView;
  initialRequest?: ApiRequest;
}): Promise<AppWindowInfo> {
  if (!canUseTauriIpc()) {
    throw new Error("New windows are only available in the desktop app.");
  }

  const label = createWindowLabel();
  const title = options?.title ?? "Pulse API Client";

  await registerPendingWindowInit(label, options);
  await openWebviewWindow(label, title);

  return { label, title, isMain: false };
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
