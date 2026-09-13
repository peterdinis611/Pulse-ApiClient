import type { CollectionGroup, HttpMethod, SavedRequest } from "@/types";

const METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

function pathFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.pathname || "/";
  } catch {
    const withoutQuery = url.split("?")[0] ?? "/";
    const marker = withoutQuery.indexOf("://");
    if (marker < 0) return withoutQuery.startsWith("/") ? withoutQuery : `/${withoutQuery}`;
    const rest = withoutQuery.slice(marker + 3);
    const slash = rest.indexOf("/");
    return slash < 0 ? "/" : rest.slice(slash) || "/";
  }
}

function serverFromUrls(urls: string[]): string {
  for (const url of urls) {
    try {
      const parsed = new URL(url);
      return parsed.origin;
    } catch {
      // keep looking
    }
  }
  return "http://localhost";
}

export function exportOpenApiCollection(group: CollectionGroup, requests: SavedRequest[]): string {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const saved of requests) {
    const method = saved.request.method;
    if (!METHODS.includes(method)) continue;
    const path = pathFromUrl(saved.request.url);
    const operation: Record<string, unknown> = {
      operationId: saved.id,
      summary: saved.name || saved.request.name,
      responses: {
        "200": { description: "OK" },
      },
    };

    const schemaRaw = saved.request.responseSchema?.trim();
    if (schemaRaw) {
      try {
        operation.responses = {
          "200": {
            description: "OK",
            content: {
              "application/json": { schema: JSON.parse(schemaRaw) },
            },
          },
        };
      } catch {
        // keep generic 200
      }
    }

    if (saved.request.bodyKind === "json" && saved.request.body.trim()) {
      try {
        operation.requestBody = {
          content: {
            "application/json": { example: JSON.parse(saved.request.body) },
          },
        };
      } catch {
        operation.requestBody = {
          content: { "application/json": { example: saved.request.body } },
        };
      }
    }

    const query = saved.request.query.filter((item) => item.enabled && item.key.trim());
    if (query.length > 0) {
      operation.parameters = query.map((item) => ({
        name: item.key,
        in: "query",
        schema: { type: "string", default: item.value },
      }));
    }

    paths[path] = { ...(paths[path] ?? {}), [method.toLowerCase()]: operation };
  }

  const spec = {
    openapi: "3.0.3",
    info: { title: group.name, version: "1.0.0" },
    servers: [{ url: serverFromUrls(requests.map((item) => item.request.url)) }],
    paths,
  };

  return JSON.stringify(spec, null, 2);
}
