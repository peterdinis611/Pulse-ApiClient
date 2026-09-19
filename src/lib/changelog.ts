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
