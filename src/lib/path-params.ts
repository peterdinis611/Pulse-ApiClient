import type { KeyValue } from "@/types";

const PATH_TOKEN = /:([A-Za-z_][A-Za-z0-9_]*)|\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

/** Path portion only — never treat `https:` or `:3000` as a param. */
export function urlPathPortion(url: string): string {
  const noQuery = url.trim().split(/[?#]/)[0] ?? "";
  const protocol = noQuery.match(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//);
  if (protocol) {
    const rest = noQuery.slice(protocol[0].length);
    const slash = rest.indexOf("/");
    return slash === -1 ? "" : rest.slice(slash);
  }
  const slash = noQuery.indexOf("/");
  return slash === -1 ? noQuery : noQuery.slice(slash);
}

export function extractPathParamNames(url: string): string[] {
  const path = urlPathPortion(url);
  const names: string[] = [];
  const seen = new Set<string>();
  PATH_TOKEN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = PATH_TOKEN.exec(path)) !== null) {
    const name = match[1] ?? match[2];
    if (!name || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}

export function syncPathParams(url: string, existing: KeyValue[] = []): KeyValue[] {
  const names = extractPathParamNames(url);
  const byKey = new Map(
    existing.filter((row) => row.key.trim()).map((row) => [row.key.trim(), row]),
  );
  return names.map((name) => {
    const current = byKey.get(name);
    return current
      ? { ...current, key: name }
      : {
          id: `kv_${crypto.randomUUID()}`,
          key: name,
          value: "",
          enabled: true,
        };
  });
}

export function applyPathParams(url: string, params: KeyValue[]): string {
  const values = new Map(
    params
      .filter((row) => row.enabled && row.key.trim())
      .map((row) => [row.key.trim(), row.value]),
  );

  const replacePath = (path: string) =>
    path.replace(PATH_TOKEN, (full, colonName: string | undefined, braceName: string | undefined) => {
      const name = colonName ?? braceName;
      if (!name) return full;
      const value = values.get(name);
      if (value == null || value === "") return full;
      return encodeURIComponent(value).replace(/%2F/g, "/");
    });

  const hashIndex = url.indexOf("#");
  const hash = hashIndex >= 0 ? url.slice(hashIndex) : "";
  const withoutHash = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  const queryIndex = withoutHash.indexOf("?");
  const query = queryIndex >= 0 ? withoutHash.slice(queryIndex) : "";
  const base = queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;

  const protocol = base.match(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//);
  if (protocol) {
    const rest = base.slice(protocol[0].length);
    const slash = rest.indexOf("/");
    if (slash === -1) return `${base}${query}${hash}`;
    const host = rest.slice(0, slash);
    const path = replacePath(rest.slice(slash));
    return `${protocol[0]}${host}${path}${query}${hash}`;
  }

  const slash = base.indexOf("/");
  if (slash === -1) return `${replacePath(base)}${query}${hash}`;
  return `${base.slice(0, slash)}${replacePath(base.slice(slash))}${query}${hash}`;
}
