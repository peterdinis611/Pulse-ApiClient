import { createId } from "@/lib/helpers";
import type { HttpResponse, RequestExample } from "@/types";

export function snapshotResponseExample(response: HttpResponse, name?: string): RequestExample {
  const fallback = `${response.status} ${response.statusText}`.trim() || "Example";
  return {
    id: createId("ex"),
    name: name?.trim() || fallback,
    savedAt: new Date().toISOString(),
    response: structuredClone(response),
  };
}
