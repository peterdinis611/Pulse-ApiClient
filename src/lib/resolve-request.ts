import { mergeVariableLayers } from "./env";
import { applyRequestInheritance, collectFolderVariables } from "./inherit";
import type { ApiRequest, CollectionGroup, Environment, KeyValue } from "@/types";

export function resolveRequestForSend(input: {
  request: ApiRequest;
  collection?: CollectionGroup | null;
  folder?: string | null;
  globals?: KeyValue[];
  environment?: Environment | null;
}): { request: ApiRequest; environment: Environment | null } {
  const inherited = applyRequestInheritance(
    input.request,
    input.collection ?? null,
    input.folder,
  );
  const environment = mergeVariableLayers([
    input.globals,
    input.collection?.variables,
    collectFolderVariables(input.collection ?? null, input.folder),
    input.environment?.variables,
  ]);
  return {
    request: inherited,
    environment: environment.variables.length ? environment : input.environment ?? null,
  };
}
