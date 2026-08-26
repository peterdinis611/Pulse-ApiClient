import { defaultAuth } from "./helpers";
import type { ApiRequest, AuthConfig, CollectionGroup, FolderConfig, KeyValue } from "@/types";

export function folderPathChain(folder?: string | null): string[] {
  const normalized = folder?.trim();
  if (!normalized) return [];
  const parts = normalized.split("/").filter(Boolean);
  return parts.map((_, index) => parts.slice(0, index + 1).join("/"));
}

export function folderConfigFor(collection: CollectionGroup | null, path: string): FolderConfig | undefined {
  return collection?.folderConfigs?.find((item) => item.path === path);
}

function isConcreteAuth(auth?: AuthConfig | null): auth is AuthConfig {
  return Boolean(auth && auth.authType && auth.authType !== "inherit" && auth.authType !== "none");
}

export type InheritSource = {
  label: string;
  auth: AuthConfig;
};

export function resolveInheritedAuth(
  requestAuth: AuthConfig,
  collection: CollectionGroup | null,
  folder?: string | null,
): InheritSource {
  if (requestAuth.authType !== "inherit") {
    return { label: "This request", auth: requestAuth };
  }

  const chain = folderPathChain(folder);
  for (let index = chain.length - 1; index >= 0; index -= 1) {
    const config = folderConfigFor(collection, chain[index]!);
    if (!config?.auth || config.auth.authType === "inherit") continue;
    if (config.auth.authType === "none") {
      return { label: `Folder ${chain[index]}`, auth: config.auth };
    }
    if (isConcreteAuth(config.auth)) {
      return { label: `Folder ${chain[index]}`, auth: config.auth };
    }
  }

  if (collection?.auth && collection.auth.authType !== "inherit") {
    return { label: `Collection ${collection.name}`, auth: collection.auth };
  }

  return { label: "No parent auth", auth: defaultAuth() };
}

function joinScripts(scripts: Array<string | undefined>): string {
  return scripts
    .map((script) => script?.trim() ?? "")
    .filter(Boolean)
    .join("\n\n");
}

export function resolveInheritedPreRequest(
  requestScript: string,
  collection: CollectionGroup | null,
  folder?: string | null,
): string {
  const folderScripts = folderPathChain(folder).map(
    (path) => folderConfigFor(collection, path)?.preRequestScript,
  );
  return joinScripts([collection?.preRequestScript, ...folderScripts, requestScript]);
}

export function resolveInheritedTests(
  requestTests: string,
  collection: CollectionGroup | null,
  folder?: string | null,
): string {
  const folderScripts = folderPathChain(folder)
    .slice()
    .reverse()
    .map((path) => folderConfigFor(collection, path)?.tests);
  return joinScripts([requestTests, ...folderScripts, collection?.tests]);
}

export function collectFolderVariables(
  collection: CollectionGroup | null,
  folder?: string | null,
): KeyValue[] {
  const rows: KeyValue[] = [];
  for (const path of folderPathChain(folder)) {
    const config = folderConfigFor(collection, path);
    if (config?.variables?.length) rows.push(...config.variables);
  }
  return rows;
}

export function applyRequestInheritance(
  request: ApiRequest,
  collection: CollectionGroup | null,
  folder?: string | null,
): ApiRequest {
  const auth = resolveInheritedAuth(request.auth, collection, folder).auth;
  return {
    ...request,
    auth,
    preRequestScript: resolveInheritedPreRequest(request.preRequestScript, collection, folder),
    tests: resolveInheritedTests(request.tests, collection, folder),
  };
}

export function upsertFolderConfig(
  collection: CollectionGroup,
  path: string,
  patch: Partial<FolderConfig>,
): CollectionGroup {
  const folderConfigs = [...(collection.folderConfigs ?? [])];
  const index = folderConfigs.findIndex((item) => item.path === path);
  const next: FolderConfig = {
    path,
    ...(index >= 0 ? folderConfigs[index] : {}),
    ...patch,
  };
  if (index >= 0) folderConfigs[index] = next;
  else folderConfigs.push(next);
  return { ...collection, folderConfigs };
}
