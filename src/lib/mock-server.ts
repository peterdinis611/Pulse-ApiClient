import { invoke } from "@tauri-apps/api/core";
import type { SavedRequest } from "@/types";
import { canUseTauriIpc } from "./tauri-runtime";

export const LOCKED_MOCK_PORT = 4010;
export const MAX_MOCK_DELAY_MS = 60_000;

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
  matchQuery?: MockHeader[];
  matchHeaders?: MockHeader[];
  matchBodyIncludes?: string;
};

export type MockServerHandle = {
  url: string;
  port: number;
  locked: boolean;
  routeCount: number;
  delayMs: number;
};

/** Build mock routes via pulse-core (`mock_routes_from_collections`). Matchers omitted on Rust side. */
export async function mockRoutesFromCollections(collections: SavedRequest[]): Promise<MockRoute[]> {
  if (!canUseTauriIpc()) {
    throw new Error("Mock routes require the desktop app");
  }
  return invoke<MockRoute[]>("mock_routes_from_collections", { collections });
}

export function clampMockDelayMs(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(Math.floor(value), MAX_MOCK_DELAY_MS);
}

export async function startMockServer(
  routes: MockRoute[],
  delayMs = 0,
): Promise<MockServerHandle> {
  if (!canUseTauriIpc()) {
    throw new Error("Mock server is desktop-only");
  }
  return invoke<MockServerHandle>("mock_server_start", {
    routes,
    delayMs: clampMockDelayMs(delayMs),
  });
}

export async function stopMockServer(): Promise<void> {
  if (!canUseTauriIpc()) return;
  await invoke("mock_server_stop");
}
