import { invoke } from "@tauri-apps/api/core";
import { canUseTauriIpc } from "./tauri-runtime";
import type { CollectionGroup, SavedRequest } from "@/types";

/** Export a collection as OpenAPI 3 via pulse-core (`openapi_export_collection`). */
export async function exportOpenApiCollection(
  group: CollectionGroup,
  requests: SavedRequest[],
): Promise<string> {
  if (!canUseTauriIpc()) {
    throw new Error("OpenAPI export requires the desktop app");
  }
  const spec = await invoke<unknown>("openapi_export_collection", {
    payload: {
      collectionGroups: [group],
      collections: requests,
    },
  });
  return JSON.stringify(spec, null, 2);
}
