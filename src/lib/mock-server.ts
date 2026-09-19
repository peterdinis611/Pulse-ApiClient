import { invoke } from "@tauri-apps/api/core";
import type { SavedRequest } from "@/types";
import { canUseTauriIpc } from "./tauri-runtime";

export type MockRoute = {
  method: string;
  path: string;
  status: number;
  body: string;
  contentType: string;
};

export type MockServerHandle = {
  url: string;
  port: number;
};

export function mockRoutesFromCollections(collections: SavedRequest[]): MockRoute[] {
  return collections.flatMap((saved) => {
    const example = saved.request.examples[0];
    if (!example) return [];
    let path = "/";
    try {
      path = new URL(saved.request.url.replace(/\{\{[^}]+\}\}/g, "x")).pathname;
    } catch {
      const slash = saved.request.url.indexOf("/", saved.request.url.indexOf("//") + 2);
      path = slash >= 0 ? saved.request.url.slice(slash).split("?")[0] || "/" : "/";
    }
    return [
      {
        method: saved.request.method,
        path,
        status: example.response.status || 200,
        body: example.response.body || "{}",
        contentType: example.response.contentType || "application/json",
      },
    ];
  });
}

export async function startMockServer(routes: MockRoute[]): Promise<MockServerHandle> {
  if (!canUseTauriIpc()) {
    throw new Error("Mock server is desktop-only");
  }
  return invoke<MockServerHandle>("mock_server_start", { routes });
}

export async function stopMockServer(): Promise<void> {
  if (!canUseTauriIpc()) return;
  await invoke("mock_server_stop");
}
