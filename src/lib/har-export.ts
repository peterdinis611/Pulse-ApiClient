import type { ApiRequest, HistoryEntry, KeyValue } from "@/types";

type HarHeader = { name: string; value: string };
type HarQuery = { name: string; value: string };

function enabledPairs(items: KeyValue[] | undefined): Array<{ name: string; value: string }> {
  return (items ?? [])
    .filter((item) => item.enabled !== false && item.key.trim())
    .map((item) => ({ name: item.key, value: item.value }));
}

function requestHeaders(request: ApiRequest): HarHeader[] {
  const headers = enabledPairs(request.headers);
  if (request.auth?.authType === "bearer" && request.auth.bearerToken) {
    headers.push({ name: "Authorization", value: `Bearer ${request.auth.bearerToken}` });
  } else if (request.auth?.authType === "basic") {
    const token = btoa(`${request.auth.basicUsername}:${request.auth.basicPassword}`);
    headers.push({ name: "Authorization", value: `Basic ${token}` });
  } else if (request.auth?.authType === "apiKey" && request.auth.apiKeyIn === "header") {
    headers.push({ name: request.auth.apiKeyKey, value: request.auth.apiKeyValue });
  }
  return headers;
}

function postData(request: ApiRequest): Record<string, unknown> | undefined {
  if (request.bodyKind === "none") return undefined;
  if (request.bodyKind === "form") {
    return {
      mimeType: "application/x-www-form-urlencoded",
      params: enabledPairs(request.form),
      text: enabledPairs(request.form)
        .map((item) => `${encodeURIComponent(item.name)}=${encodeURIComponent(item.value)}`)
        .join("&"),
    };
  }
  if (request.bodyKind === "multipart") {
    return {
      mimeType: "multipart/form-data",
      params: (request.multipart ?? [])
        .filter((field) => field.enabled !== false && field.key.trim())
        .map((field) => ({
          name: field.key,
          value: field.fieldType === "file" ? "" : field.value,
          ...(field.fileName ? { fileName: field.fileName } : {}),
        })),
    };
  }
  if (request.bodyKind === "graphql") {
    const text = JSON.stringify({
      query: request.graphqlQuery,
      variables: (() => {
        try {
          return JSON.parse(request.graphqlVariables || "{}");
        } catch {
          return {};
        }
      })(),
    });
    return { mimeType: "application/json", text };
  }
  if (request.bodyKind === "json") {
    return { mimeType: "application/json", text: request.body };
  }
  return { mimeType: "text/plain", text: request.body };
}

function withQuery(url: string, query: HarQuery[]): string {
  if (!query.length) return url;
  try {
    const parsed = new URL(url);
    for (const item of query) {
      parsed.searchParams.append(item.name, item.value);
    }
    return parsed.toString();
  } catch {
    const joiner = url.includes("?") ? "&" : "?";
    return `${url}${joiner}${query
      .map((item) => `${encodeURIComponent(item.name)}=${encodeURIComponent(item.value)}`)
      .join("&")}`;
  }
}

function entryToHar(entry: HistoryEntry): Record<string, unknown> {
  const request = entry.request;
  const query = enabledPairs(request.query);
  if (request.auth?.authType === "apiKey" && request.auth.apiKeyIn === "query") {
    query.push({ name: request.auth.apiKeyKey, value: request.auth.apiKeyValue });
  }
  const headers = requestHeaders(request);
  const post = postData(request);
  const bodySize = post && typeof post.text === "string" ? (post.text as string).length : 0;
  const status = entry.response?.status ?? 0;
  const elapsed = entry.response?.elapsedMs ?? 0;
  const sizeBytes = entry.response?.sizeBytes ?? 0;

  return {
    startedDateTime: entry.sentAt,
    time: elapsed,
    request: {
      method: request.method,
      url: withQuery(request.url, query),
      httpVersion: "HTTP/1.1",
      cookies: [],
      headers,
      queryString: query,
      ...(post ? { postData: post } : {}),
      headersSize: -1,
      bodySize,
    },
    response: {
      status,
      statusText: status ? String(status) : "",
      httpVersion: "HTTP/1.1",
      cookies: [],
      headers: [],
      content: {
        size: sizeBytes,
        mimeType: "application/octet-stream",
        text: "",
        comment: "Pulse history stores status/timing/size only — body not captured",
      },
      redirectURL: "",
      headersSize: -1,
      bodySize: sizeBytes,
    },
    cache: {},
    timings: {
      blocked: -1,
      dns: -1,
      connect: -1,
      send: 0,
      wait: elapsed,
      receive: 0,
      ssl: -1,
    },
    comment: entry.source ? `pulse:${entry.source}` : "pulse:desktop",
  };
}

export function exportHistoryAsHar(entries: HistoryEntry[]): string {
  return JSON.stringify(
    {
      log: {
        version: "1.2",
        creator: { name: "Pulse", version: "2.1.0" },
        entries: entries.map(entryToHar),
      },
    },
    null,
    2,
  );
}
