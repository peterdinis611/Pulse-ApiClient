import { invoke } from "@tauri-apps/api/core";
import type { SavedRequest } from "@/types";
import { canUseTauriIpc } from "./tauri-runtime";

export const LOCKED_MOCK_PORT = 4010;

const HIDDEN_HEADERS = new Set([
  "x-request-id",
  "server",
  "date",
  "connection",
  "keep-alive",
  "transfer-encoding",
  "content-length",
]);

export type MockHeader = {
  key: string;
  value: string;
};

export type MockRoute = {
  method: string;
  path: string;
  status: number;
  body: string;
  contentType: string;
  headers: MockHeader[];
  exampleName: string;
};

export type MockServerHandle = {
  url: string;
  port: number;
  locked: boolean;
  routeCount: number;
};

function isHiddenHeader(key: string): boolean {
  const lower = key.trim().toLowerCase();
  return lower.startsWith("x-pulse-") || HIDDEN_HEADERS.has(lower);
}

function requestPath(url: string): string {
  try {
    return new URL(url.replace(/\{\{[^}]+\}\}/g, "x")).pathname;
  } catch {
    const slash = url.indexOf("/", url.indexOf("//") + 2);
    return slash >= 0 ? url.slice(slash).split("?")[0] || "/" : "/";
  }
}

export function mockRoutesFromCollections(collections: SavedRequest[]): MockRoute[] {
  return collections.flatMap((saved) => {
    const examples = saved.request.examples ?? [];
    if (examples.length === 0) return [];
    const path = requestPath(saved.request.url);
    return examples.map((example) => ({
      method: saved.request.method,
      path,
      status: example.response.status || 200,
      body: example.response.body || "",
      contentType: example.response.contentType?.trim() || "",
      exampleName: example.name.trim() || "example",
      headers: (example.response.headers ?? [])
        .filter((header) => header.key.trim() && !isHiddenHeader(header.key))
        .map((header) => ({ key: header.key, value: header.value })),
    }));
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
