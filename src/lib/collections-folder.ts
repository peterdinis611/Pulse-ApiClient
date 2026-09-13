import { open } from "@tauri-apps/plugin-dialog";
import type { AppSettings } from "@/types";
import { invokeEffect } from "./effect/tauri";
import { runEffect } from "./effect/run";
import { canUseTauriIpc } from "./tauri-runtime";

export type CollectionFolderFile = {
  name: string;
  contents: string;
};

export async function pickCollectionsFolder(): Promise<string | null> {
  const selected = await open({
    multiple: false,
    directory: true,
  });
  if (selected === null) return null;
  return Array.isArray(selected) ? selected[0] ?? null : selected;
}

export async function setCollectionsFolderPath(path: string | null): Promise<AppSettings> {
  return runEffect(invokeEffect<AppSettings>("set_collections_folder", { path }));
}

export async function writeCollectionsFolder(
  dir: string,
  files: CollectionFolderFile[],
): Promise<string[]> {
  return runEffect(invokeEffect<string[]>("write_collections_folder", { dir, files }));
}

export async function readCollectionsFolder(dir: string): Promise<CollectionFolderFile[]> {
  return runEffect(invokeEffect<CollectionFolderFile[]>("read_collections_folder", { dir }));
}

export function collectionsFolderAvailable(): boolean {
  return canUseTauriIpc();
}
