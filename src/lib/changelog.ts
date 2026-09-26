import type { BuiltInLocale } from "@/lib/i18n";

export type LocaleCopy = { en: string; sk: string };

export type ChangelogChange = {
  id: string;
  title: LocaleCopy;
  detail: LocaleCopy;
};

export type ChangelogRelease = {
  version: string;
  date: string;
  title: LocaleCopy;
  summary: LocaleCopy;
  changes: ChangelogChange[];
};

export function pickCopy(copy: LocaleCopy, locale: BuiltInLocale): string {
  return copy[locale] || copy.en;
}

/** Oldest → newest. Add a block here before bumping package.json. */
export const CHANGELOG: ChangelogRelease[] = [
  {
    version: "0.3.0",
    date: "2026-09-19",
    title: {
      en: "Git as source of truth",
      sk: "Git ako zdroj pravdy",
    },
    summary: {
      en: "Collections live in YAML on disk. SQLite keeps history, cache, and session. Secrets never land in Git.",
      sk: "Kolekcie žijú v YAML na disku. SQLite drží históriu, cache a reláciu. Secret hodnoty do Gitu nepatria.",
    },
    changes: [
      {
        id: "git-yaml",
        title: { en: "YAML Git workspace", sk: "YAML Git workspace" },
        detail: {
          en: "Attach a folder in Settings → Data. Pulse writes pulse.yaml, collection.yaml, and one *.pulse.yaml per request.",
          sk: "Priečinok pripojíš v Nastavenia → Dáta. Pulse zapisuje pulse.yaml, collection.yaml a jeden *.pulse.yaml na request.",
        },
      },
      {
        id: "watch",
        title: { en: "Live file watch", sk: "Sledovanie súborov" },
        detail: {
          en: "Disk edits reload the workspace. A dirty tab gets a line-diff instead of a silent overwrite.",
          sk: "Zmeny na disku workspace znova načítajú. Špinavý tab ukáže line-diff namiesto tichého prepísania.",
        },
      },
      {
        id: "secrets",
        title: { en: "{{secret.*}} stays off Git", sk: "{{secret.*}} ostáva mimo Git" },
        detail: {
          en: "Values come from gitignored .env and the OS keychain. History JSON is redacted.",
          sk: "Hodnoty berie z gitignorovaného .env a kľúčenky OS. História ich v JSON zamaskuje.",
        },
      },
      {
        id: "openapi",
        title: { en: "OpenAPI explorer", sk: "OpenAPI explorer" },
        detail: {
          en: "Explorer transfer menu fetches a spec. Click an operation to open it as a request (YAML when Git is attached).",
          sk: "Menu v exploreri načíta špecifikáciu. Klik na operáciu ju otvorí ako request (YAML, keď je Git pripojený).",
        },
      },
      {
        id: "mock",
        title: { en: "Local mock server", sk: "Lokálny mock server" },
        detail: {
          en: "Serve saved 2xx examples on 127.0.0.1 from Settings → Data.",
          sk: "Uložené 2xx príklady servíruje na 127.0.0.1 z Nastavenia → Dáta.",
        },
      },
      {
        id: "graphql-ws",
        title: { en: "GraphQL over WebSocket", sk: "GraphQL cez WebSocket" },
        detail: {
          en: "Protocol WS + GraphQL body sends graphql-transport-ws subscribe frames.",
          sk: "Protokol WS + GraphQL body posiela graphql-transport-ws subscribe snímky.",
        },
      },
      {
        id: "mcp",
        title: { en: "MCP on the Rust engine", sk: "MCP na Rust engine" },
        detail: {
          en: "pulse-mcp talks YAML workspace tools (send-by-id, envs, history, pending, search, contract). Mutating calls need confirm=true.",
          sk: "pulse-mcp volá YAML workspace tools (send podľa id, envs, história, pending, search, kontrakt). Mutácie vyžadujú confirm=true.",
        },
      },
      {
        id: "privacy",
        title: { en: "Privacy policy", sk: "Zásady súkromia" },
        detail: {
          en: "No Pulse cloud, no telemetry. Docs → Privacy policy.",
          sk: "Žiadny Pulse cloud, žiadna telemetria. Docs → Zásady súkromia.",
        },
      },
    ],
  },
  {
    version: "2.0.0",
    date: "2026-09-19",
    title: {
      en: "Pulse 2.0",
      sk: "Pulse 2.0",
    },
    summary: {
      en: "Locked local mock on :4010, every saved example as a route, no synthetic headers, and the public version is 2.0.",
      sk: "Zamknutý lokálny mock na :4010, každý uložený príklad ako route, žiadne syntetické hlavičky a verejná verzia je 2.0.",
    },
    changes: [
      {
        id: "mock-lock",
        title: { en: "Locked mock port", sk: "Zamknutý mock port" },
        detail: {
          en: "Settings → Data starts the mock on 127.0.0.1:4010. If the port is busy, Pulse errors instead of hopping to a random port.",
          sk: "Nastavenia → Dáta spustí mock na 127.0.0.1:4010. Ak je port obsadený, Pulse neskáče na náhodný — vráti chybu.",
        },
      },
      {
        id: "mock-examples",
        title: { en: "Every saved example", sk: "Každý uložený príklad" },
        detail: {
          en: "All Examples-tab snapshots become routes. Pick one with ?example=name or ?status=404. Git YAML stores the list.",
          sk: "Všetky snímky z tabu Examples sú routy. Vyber ?example=name alebo ?status=404. Git YAML ich uloží ako zoznam.",
        },
      },
      {
        id: "no-hidden-headers",
        title: { en: "No hidden headers", sk: "Žiadne skryté hlavičky" },
        detail: {
          en: "The mock echoes only headers on the saved example. The HTTP client sends no default User-Agent or Accept-Encoding unless you set them.",
          sk: "Mock vráti len hlavičky z uloženého príkladu. HTTP klient neposiela predvolený User-Agent ani Accept-Encoding, kým ich nenastavíš.",
        },
      },
      {
        id: "onboarding",
        title: { en: "First-run setup", sk: "Úvodné nastavenie" },
        detail: {
          en: "On a fresh install Pulse asks for language, theme, and start view. The same controls stay in Settings → Appearance and Layout.",
          sk: "Pri čistej inštalácii Pulse požiada o jazyk, tému a úvodný pohľad. Tie isté ovládania ostávajú v Nastavenia → Vzhľad a Rozloženie.",
        },
      },
    ],
  },
  {
    version: "2.1.0",
    date: "2026-09-26",
    title: {
      en: "Round-trips & agent CI",
      sk: "Round-trip a agent CI",
    },
    summary: {
      en: "Bruno/Insomnia export, mock latency + MCP mock, env .env/Postman I/O, more snippets, full HAR dump, richer CLI/MCP, faster HTTP cache + cURL.",
      sk: "Bruno/Insomnia export, latencia mocku + MCP mock, env .env/Postman, viac snippetov, plný HAR dump, bohatšie CLI/MCP, rýchlejší HTTP cache + cURL.",
    },
    changes: [
      {
        id: "bruno-insomnia-export",
        title: { en: "Bruno & Insomnia export", sk: "Bruno a Insomnia export" },
        detail: {
          en: "Collection ⋯ and the export menu write Bruno and Insomnia JSON — round-trip with the existing importers.",
          sk: "Menu kolekcie a export zapíšu Bruno a Insomnia JSON — round-trip s existujúcimi importérmi.",
        },
      },
      {
        id: "http-cache-curl",
        title: { en: "Faster cache & richer cURL", sk: "Rýchlejší cache a bohatší cURL" },
        detail: {
          en: "HTTP engine: gzip/brotli, HTTP/2 keep-alive, s-maxage/Expires, ETag revalidation, async disk cache. Native parse_curl/format_curl plus --json/-F/-G/-I in the UI importer.",
          sk: "HTTP engine: gzip/brotli, HTTP/2 keep-alive, s-maxage/Expires, ETag revalidácia, async disk cache. Native parse_curl/format_curl plus --json/-F/-G/-I v UI importéri.",
        },
      },
      {
        id: "mcp-guide-page",
        title: { en: "MCP how-to page", sk: "MCP návod v appke" },
        detail: {
          en: "Left rail → MCP explains Cursor setup, tools, prompts, resources, and confirm safety — bilingual EN/SK.",
          sk: "Ľavý rail → MCP vysvetlí Cursor setup, tools, prompty, resources a confirm bezpečnosť — dvojjazyčne EN/SK.",
        },
      },
      {
        id: "mock-delay",
        title: { en: "Mock latency", sk: "Latencia mocku" },
        detail: {
          en: "Settings → Data sets a base delay (ms). Override per call with ?delay=80. Cap is 60s; port stays :4010.",
          sk: "Nastavenia → Dáta nastavia základné oneskorenie (ms). Na volanie prepíšeš ?delay=80. Strop 60s; port ostáva :4010.",
        },
      },
      {
        id: "mcp-one",
        title: { en: "One MCP server", sk: "Jeden MCP server" },
        detail: {
          en: ".cursor/mcp.json keeps only pulse (Python). Paths in tool results stay POSIX on Windows.",
          sk: ".cursor/mcp.json drží len pulse (Python). Cesty vo výsledkoch tools ostávajú POSIX aj na Windowse.",
        },
      },
      {
        id: "cli-workspace-parity",
        title: { en: "CLI workspace parity", sk: "CLI workspace parita" },
        detail: {
          en: "pulse workspace covers status/list/search/envs/history/pending/read/write/delete/send/import-openapi/export-openapi. Also pre-request, graphql, mock, env, last-run, validate-run, doctor, help.",
          sk: "pulse workspace pokrýva status/list/search/envs/history/pending/read/write/delete/send/import-openapi/export-openapi. Plus pre-request, graphql, mock, env, last-run, validate-run, doctor, help.",
        },
      },
      {
        id: "cli-curl-diff-snippet",
        title: { en: "CLI curl / diff / snippet", sk: "CLI curl / diff / snippet" },
        detail: {
          en: "pulse curl, pulse diff, and pulse snippet are first-class subcommands. har accepts --export for Pulse → HAR. openapi supports --list and --export.",
          sk: "pulse curl, pulse diff a pulse snippet sú riadne subcommands. har berie --export pre Pulse → HAR. openapi podporuje --list a --export.",
        },
      },
      {
        id: "har-history",
        title: { en: "HAR from history", sk: "HAR z histórie" },
        detail: {
          en: "Explorer History exports loaded page or all stored entries as HAR 1.2 (status/timing; body not stored).",
          sk: "Explorer História exportuje načítanú stránku alebo celú históriu ako HAR 1.2 (status/čas; telo nie je uložené).",
        },
      },
      {
        id: "rust-mcp-tools",
        title: { en: "Richer Rust MCP", sk: "Bohatší Rust MCP" },
        detail: {
          en: "pulse-mcp adds run_tests, pre_request, run_collection, openapi_list, and mock_start/stop on pulse-core.",
          sk: "pulse-mcp pridáva run_tests, pre_request, run_collection, openapi_list a mock_start/stop na pulse-core.",
        },
      },
      {
        id: "env-io",
        title: { en: "Env .env & Postman export", sk: "Env .env a Postman export" },
        detail: {
          en: "Environments view exports Pulse JSON, Postman environment, or .env — and imports .env / Postman / Pulse.",
          sk: "Environments exportuje Pulse JSON, Postman environment alebo .env — a importuje .env / Postman / Pulse.",
        },
      },
      {
        id: "snippets-extra",
        title: { en: "OkHttp, reqwest, Swift snippets", sk: "OkHttp, reqwest, Swift snippety" },
        detail: {
          en: "Code tab and CLI snippet formats include Java OkHttp, Rust reqwest, and Swift URLSession.",
          sk: "Tab Code a CLI snippet formáty zahŕňajú Java OkHttp, Rust reqwest a Swift URLSession.",
        },
      },
      {
        id: "mcp-mock",
        title: { en: "Mock from MCP", sk: "Mock z MCP" },
        detail: {
          en: "pulse_mock_start / pulse_mock_stop lock 127.0.0.1:4010 from workspace examples (Python + Rust MCP).",
          sk: "pulse_mock_start / pulse_mock_stop zamknú 127.0.0.1:4010 z examples workspace (Python + Rust MCP).",
        },
      },
    ],
  },
];

export function parseSemver(version: string): [number, number, number] {
  const [major = 0, minor = 0, patch = 0] = version
    .trim()
    .replace(/^v/i, "")
    .split(".")
    .map((part) => {
      const value = Number.parseInt(part, 10);
      return Number.isFinite(value) ? value : 0;
    });
  return [major, minor, patch];
}

export function compareSemver(left: string, right: string): number {
  const a = parseSemver(left);
  const b = parseSemver(right);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1;
  }
  return 0;
}

export function unseenReleases(lastSeen: string | null, current: string): ChangelogRelease[] {
  if (lastSeen == null) {
    return CHANGELOG.filter((release) => release.version === current);
  }
  return CHANGELOG.filter(
    (release) =>
      compareSemver(release.version, lastSeen) > 0 && compareSemver(release.version, current) <= 0,
  );
}

export function releasesUpTo(current: string): ChangelogRelease[] {
  return CHANGELOG.filter((release) => compareSemver(release.version, current) <= 0);
}

export function latestRelease(current: string): ChangelogRelease | undefined {
  const seen = releasesUpTo(current);
  return seen[seen.length - 1];
}
