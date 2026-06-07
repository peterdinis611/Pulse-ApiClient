declare global {
  interface Window {
    __TAURI_INTERNALS__?: {
      invoke?: (
        cmd: string,
        args?: Record<string, unknown>,
        options?: unknown,
      ) => Promise<unknown>;
      metadata?: {
        currentWindow?: { label?: string };
        currentWebview?: { label?: string };
      };
    };
  }
}

export function canUseTauriIpc(): boolean {
  return typeof window !== "undefined" && typeof window.__TAURI_INTERNALS__?.invoke === "function";
}

export async function waitForTauriIpc(timeoutMs = 5000): Promise<boolean> {
  if (canUseTauriIpc()) return true;

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 20));
    if (canUseTauriIpc()) return true;
  }

  return canUseTauriIpc();
}
