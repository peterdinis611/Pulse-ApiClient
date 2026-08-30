export type FeatureDocGroup =
  | "Workspace"
  | "Scripting"
  | "Data"
  | "Appearance"
  | "Productivity";

export type FeatureDocSection = {
  id: string;
  title: string;
  summary: string;
  group: FeatureDocGroup;
  items: string[];
  howTo?: string[];
  tips?: string[];
};

/** In-app + markdown source of truth for Pulse feature docs. */
export const FEATURE_DOC_SECTIONS: FeatureDocSection[] = [
  {
    id: "overview",
    title: "Overview",
    summary: "Home screen for saved requests and recent history — open, copy, or start something new.",
    group: "Workspace",
    items: [
      "Stats at the top: collections, saved requests, open tabs, history count",
      "One row per request — click the row to open it in a tab",
      "Row menu: Open, Copy URL (no dead “more” button)",
      "Fuzzy search (`Cmd/Ctrl + F`) plus filters for method, collection, and source",
      "Empty state with New request when the workspace is blank",
    ],
    howTo: [
      "Open Overview from the left rail (or `Cmd/Ctrl + Shift + O` for a dedicated window).",
      "Type in the search field — matches name, method, and URL.",
      "Use the filter menu to narrow by HTTP method or collection.",
    ],
  },
  {
    id: "requests",
    title: "HTTP requests",
    summary: "Build and send requests from the Requests workspace.",
    group: "Workspace",
    items: [
      "Methods: GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS, QUERY",
      "Tabs: Params, Headers, Body, Auth, Pre-request, Tests, Code",
      "Body kinds: none, JSON, raw, form-urlencoded, multipart (text or file), GraphQL",
      "Headers tab includes CORS/browser presets (Origin, Referer, AC-Request-*)",
      "Desktop engine is not limited by browser CORS — set any header you need",
      "Send with `Cmd/Ctrl + Enter` (or the Send button); Cancel while in flight",
      "Name the request, pick a collection and folder, then Save",
      "Save example stores the last response on the request (Examples tab) — a snapshot of how a 200 should look",
      "Import from cURL via the ⋯ menu on the request bar",
      "Tabs for parallel requests; duplicate from the explorer",
      "QUERY is experimental — some proxies and frameworks still reject it",
    ],
    howTo: [
      "Focus the URL with `Cmd/Ctrl + L`. Use `{{baseUrl}}/users` with environment variables.",
      "Open Params for query and path values, Headers for metadata, Body for the payload.",
      "Send, then inspect the response panel. Save to keep the request in a collection.",
    ],
    tips: [
      "Use {{variable}} anywhere in URL, headers, auth, or body — values come from merged variable layers (see Environments).",
    ],
  },
  {
    id: "path-params",
    title: "Path parameters",
    summary: "Tokens in the URL path become a Path table — like Postman’s Path tab.",
    group: "Workspace",
    items: [
      "Write `:id` or `{id}` in the path, e.g. `https://api.example.com/users/:id/orders/{orderId}`",
      "Params → Path lists each name automatically; keys are read-only",
      "Enabled values replace the tokens on Send (and in the resolved URL preview)",
      "Query params stay on Params → Query — they are not mixed with path tokens",
      "`https:` and ports like `:3000` are not treated as params",
      "OpenAPI `{petId}` paths import as path params; Postman `url.variable` round-trips",
    ],
    howTo: [
      "Type the token in the URL bar, then open Params → Path and fill the value.",
      "Leave a value empty to keep the token in the request (useful while drafting).",
      "Path values can themselves contain `{{variables}}`.",
    ],
    tips: [
      "Prefer `:id` in the path and keep filters (`?status=active`) on the Query table.",
    ],
  },
  {
    id: "auth",
    title: "Authentication",
    summary: "Configure auth on the Auth tab of a request, or inherit it from a parent.",
    group: "Workspace",
    items: [
      "Inherit from collection or folder (default on new requests)",
      "No Auth — send nothing extra",
      "Bearer token",
      "Basic username / password",
      "API key (header or query)",
      "OAuth 2.0 — client credentials",
      "OAuth 2.0 — authorization code with PKCE",
      "OAuth 2.0 — refresh token flow",
    ],
    howTo: [
      "On a request, open Auth and pick a type. Inherit shows which parent supplies the credentials.",
      "OAuth 2.0 stays on the request (not on collection/folder settings) — exchange the token there.",
      "To override a collection Bearer for one call, switch that request off Inherit and set its own auth.",
    ],
    tips: [
      "Set Bearer once on the collection (explorer → ⋯ → Edit settings). Requests left on Inherit pick it up.",
    ],
  },
  {
    id: "inherit",
    title: "Collection & folder inheritance",
    summary: "Auth, variables, pre-request, and tests on a parent apply to every child that Inherits.",
    group: "Workspace",
    items: [
      "Collection settings: auth, variables, pre-request, tests",
      "Folder settings: same fields, plus Inherit from the parent collection/folder",
      "Auth resolution: nearest folder with a concrete type, else the collection, else none",
      "Pre-request runs collection → folders (outer to inner) → request",
      "Tests run request → folders (inner to outer) → collection",
      "Folder variables layer after collection variables and before the environment",
      "New requests default to Inherit so you do not copy Bearer onto every call",
    ],
    howTo: [
      "Explorer → collection ⋯ → Edit settings. Choose Bearer (or Basic / API key) and Save.",
      "On a folder row, click the settings icon to set folder-only auth or extra scripts.",
      "Keep request Auth on Inherit. The Auth tab shows which parent is used.",
    ],
    tips: [
      "A folder set to No Auth stops looking further up — children inherit “none”, not the collection token.",
    ],
  },
  {
    id: "code-snippets",
    title: "Code snippets",
    summary: "Copy the current request as client code for an app, a terminal, or a ticket.",
    group: "Workspace",
    items: [
      "Languages: cURL, JavaScript fetch, Axios, HTTPie, Python requests, Go net/http",
      "Snippets use the resolved URL (variables + path params) and inherited auth",
      "Code tab on the request — pick a language and Copy",
      "Request bar ⋯ → Copy as — same languages without leaving the URL bar",
      "Import from cURL is still on that ⋯ menu (file with a curl command)",
    ],
    howTo: [
      "Send or just fill the request, then open the Code tab.",
      "Select fetch / Axios / Python / … and Copy. Paste into the app.",
      "Or use ⋯ → Copy as when you only need a one-shot snippet.",
    ],
  },
  {
    id: "response",
    title: "Response panel",
    summary: "Inspect status, timing, size, headers, and body after Send.",
    group: "Workspace",
    items: [
      "JSON pretty-print for application/json bodies",
      "Preview for images, PDF, Excel (.xlsx), and CSV",
      "Download response body to disk",
      "Headers and timing metadata beside the body",
      "Empty, loading, and error states are distinct — you always know if a send is in flight",
    ],
  },
  {
    id: "websocket",
    title: "WebSocket",
    summary: "Connect to ws:// or wss:// endpoints from the request bar.",
    group: "Workspace",
    items: [
      "Switch protocol to WebSocket (or paste a `ws://` / `wss://` URL)",
      "Connect / Disconnect replace Send while the socket is active",
      "Headers, query, path params, and inherited auth apply on connect",
      "Send text or binary frames; ping; inspect incoming messages",
    ],
  },
  {
    id: "pre-request",
    title: "Pre-request scripts",
    summary: "Run JavaScript before Send to set variables for chaining.",
    group: "Scripting",
    items: [
      'pulse.environment.set("key", value) — write into the active environment',
      'pulse.variables.set("key", value) — same as environment.set',
      "Scripts run on single Send and during collection runs when present",
      "Parent scripts (collection, then folders) run before the request script",
      "Mutations write to the real environment, not the merged “globals + collection” view",
      "Use Templates / snippets on the Pre-request tab to get started",
    ],
    howTo: [
      "Open Pre-request on the request (or Edit settings on a collection/folder).",
      "Call pulse.environment.set(\"token\", \"…\") after a login request.",
      "Use {{token}} on later requests in the same environment.",
    ],
    tips: [
      "Set a token in request A, then use {{token}} in request B of the same collection run.",
    ],
  },
  {
    id: "tests",
    title: "Tests",
    summary: "Assert on the last response with pulse.test scripts.",
    group: "Scripting",
    items: [
      'pulse.test("name", function () { ... })',
      "pulse.response.to.have.status(200) · to.be.ok · clientError · serverError",
      'pulse.response.to.have.header("Content-Type")',
      "pulse.expect(value).to.eql / include / be.above / match / have.property",
      "pulse.response.json() · text() · responseTime",
      "pm.test / pm.expect syntax is auto-normalized to pulse.*",
      "After Send, tests on the request run, then folder tests (inner → outer), then collection tests",
      "Collection runner reports passed/failed per request",
      "Snippets on the Tests tab cover status, headers, body, JSON, GraphQL, and timing",
    ],
  },
  {
    id: "console",
    title: "Console",
    summary: "Bottom console for logs and quick pulse evaluations.",
    group: "Scripting",
    items: [
      "Toggle from the status bar (chip or terminal icon)",
      "Close with the X on the console header, Escape (when focused), or Cmd/Ctrl + J",
      "help — list commands",
      "status · text() · json() · headers · time · size",
      "Run pulse.test / pulse.expect against the last response",
    ],
  },
  {
    id: "collections",
    title: "Collections",
    summary: "Organize saved requests and run them as a set.",
    group: "Data",
    items: [
      "Save, duplicate, delete, drag-and-drop requests and folders",
      "Nested folders; empty folders can be deleted",
      "Run collection — sequential when pre-request scripts or a data file exist, otherwise can batch",
      "Run folder — Play on a folder sends that folder and its nested requests only",
      "Data file — CSV or JSON, one row = one full iteration of the collection or folder",
      "Runner uses the same inheritance and variable layers as a single Send",
      "Import Pulse JSON, Postman v2.1, Bruno, Insomnia, OpenAPI",
      "Export one collection as Pulse or Postman (⋯ menu), or the whole workspace",
      "Postman import/export keeps collection and folder auth, variables, and scripts",
      "OpenAPI `{id}` paths become path params; operations land as requests",
    ],
    howTo: [
      "Save from the request bar (collection + optional folder).",
      "Play on a collection runs every request; Play on a folder runs that folder. View results for status and tests.",
      "Spreadsheet icon (or Run with CSV / JSON) picks a data file: each row becomes `{{column}}` for one iteration.",
      "Explorer transfer menu imports a file; collection ⋯ exports Pulse or Postman JSON.",
    ],
  },
  {
    id: "environments",
    title: "Variables & environments",
    summary: "Layered values: globals → collection → folder → environment. Later layers win on the same name.",
    group: "Data",
    items: [
      "Globals — lowest precedence, shared across collections (Environments view, first chip)",
      "Collection and folder variables — set in Edit settings",
      "Environment variables — Local / staging / production; switch from the explorer or status bar",
      "Active environment wins when the same key exists in an earlier layer",
      "Secret — mask the current value in the UI (bullets)",
      "Initial vs current — snapshot plus Reset current from initial",
      "{{name}} substitution in URL, path, query, headers, auth, and body",
      "Autocomplete and the `{ }` picker list the merged enabled variables",
      "pulse.environment.set updates the real environment (current value), not globals",
      "Click a JSON key in the response body to upsert that value as {{key}} on the active environment",
    ],
    howTo: [
      "Open Environments in the rail. Edit Globals, or select an environment chip.",
      "Mark tokens and passwords as secret. Fill Initial once, then change Current per session.",
      "Put `baseUrl` on the environment and `{{baseUrl}}/users/:id` on the request.",
      "After Send, click `token` in the JSON tree — Pulse writes it to the environment and copies `{{token}}`.",
    ],
    tips: [
      "Do not type secrets into collection JSON you plan to export and share — use environment or secret globals locally.",
    ],
  },
  {
    id: "history",
    title: "History",
    summary: "Past sends stored in SQLite with search.",
    group: "Data",
    items: [
      "Paginated history in the explorer (grouped by day, stacked consecutive runs)",
      "Also listed on Overview",
      "Fuzzy search across method, URL, and name",
      "Reload a past request into a tab; preview without opening",
      "Clear history from the explorer or Settings → Data",
    ],
  },
  {
    id: "cookies",
    title: "Cookie jar",
    summary: "Inspect and edit cookies used by the HTTP engine.",
    group: "Data",
    items: [
      "Settings → Cookie jar — list, add, edit, delete",
      "Clear entire jar",
      "Settings → HTTP engine — send/store cookie toggles",
      "Cookies live with the desktop HTTP engine for the app session",
    ],
  },
  {
    id: "http-engine",
    title: "HTTP engine & CORS probing",
    summary: "Native reqwest client — CORS does not apply; configure TLS, proxy, redirects, and default Origin/Referer.",
    group: "Data",
    items: [
      "Settings → HTTP engine — concurrency, timeouts, cache (memory + disk)",
      "TLS verify on/off (self-signed / local HTTPS)",
      "HTTP(S) or SOCKS proxy URL",
      "Follow redirects + max redirects",
      "Default User-Agent, Origin, Referer",
      "Send / store cookies toggles",
      "Engine stats: active, completed, failed, cache hits",
      "Timing waterfall: DNS, TLS (TCP + handshake + wait), TTFB, transfer, total",
    ],
    howTo: [
      "Send a request, then open Response → Timing. Status 200 plus a single millisecond number is not the whole story — the bars split lookup, handshake, first byte, and body.",
    ],
    tips: [
      "Pulse is not a browser: there is no CORS preflight. Use Origin/Referer headers (or Settings defaults) to reproduce what a browser would send.",
    ],
  },
  {
    id: "themes",
    title: "Themes & custom CSS",
    summary: "Appearance lives under Settings → Appearance.",
    group: "Appearance",
    items: [
      "Built-in themes via the theme picker",
      "Custom CSS editor with snippets, CSS variables, and component hooks",
      "Live preview while editing",
      "Starter template, full example file, Apply, Export, Browse, Reload, Clear",
      "Example file: examples/pulse-theme-override.example.css",
    ],
  },
  {
    id: "search",
    title: "Search & shortcuts",
    summary: "Find requests quickly and stay on the keyboard.",
    group: "Productivity",
    items: [
      "Fuzzy search in the explorer and Overview",
      "`Cmd/Ctrl + Enter` — Send",
      "`Cmd/Ctrl + T` — new request tab",
      "`Cmd/Ctrl + W` — close tab",
      "`Cmd/Ctrl + L` — focus URL",
      "`Cmd/Ctrl + F` — search explorer or Overview",
      "`Cmd/Ctrl + B` — toggle explorer",
      "`Cmd/Ctrl + J` — toggle console",
      "`Cmd/Ctrl + Shift + N` — new window",
      "`Cmd/Ctrl + Shift + O` — overview window",
      "Cheat sheet also lives in Settings → Layout",
      "Shortcut labels show ⌘ on macOS and Ctrl+ on Windows/Linux",
    ],
  },
  {
    id: "data",
    title: "Data & privacy",
    summary: "Workspace data is local to your account on this device.",
    group: "Productivity",
    items: [
      "SQLite per user: workspace, history, HTTP cache",
      "Settings — export collections, reset database, clear cache",
      "Sign in keeps a separate auth database from workspace data",
      "No Pulse cloud — collections stay on disk unless you export them",
      "File pickers (custom CSS, runner data) are OS-agnostic — no hardcoded `~/Library` paths",
    ],
    tips: [
      "Linux AppImage and .deb need webkit2gtk 4.1 at runtime, not only when compiling. Install `libwebkit2gtk-4.1-0` (Debian/Ubuntu) if the window fails to open.",
    ],
  },
];

export const FEATURE_DOC_GROUPS: FeatureDocGroup[] = [
  "Workspace",
  "Scripting",
  "Data",
  "Appearance",
  "Productivity",
];

export const FEATURE_DOC_GROUP_BLURBS: Record<FeatureDocGroup, string> = {
  Workspace: "The request desk — URL, path params, auth, response, and extra windows.",
  Scripting: "Pre-request scripts, tests, and the bottom console against the last response.",
  Data: "Collections, environments, history, cookies, and the HTTP engine.",
  Appearance: "Built-in themes and a custom CSS overlay that can restyle the chrome.",
  Productivity: "Search, shortcuts, and what stays on this machine.",
};

const FUMADOCS_SCREENSHOTS: Partial<Record<string, { src: string; alt: string }>> = {
  overview: { src: "/screenshots/overview.png", alt: "Pulse Overview — saved requests and history" },
  requests: { src: "/screenshots/request.png", alt: "Pulse request workspace" },
  auth: { src: "/screenshots/auth.png", alt: "Pulse sign-in" },
  themes: { src: "/screenshots/settings.png", alt: "Pulse settings and themes" },
};

export function featureDocsMarkdown(): string {
  const lines: string[] = [
    "# Pulse feature guide",
    "",
    "In-app: open **Docs** from the left rail. Generated from `src/lib/feature-docs.ts`. Fumadocs site: `bun run docs:dev`.",
    "",
    "Same chapters as the public field manual — Workspace, Scripting, Data, Appearance, Productivity.",
    "",
  ];

  for (const group of FEATURE_DOC_GROUPS) {
    const sections = FEATURE_DOC_SECTIONS.filter((section) => section.group === group);
    if (sections.length === 0) continue;
    lines.push(`## ${group}`, "");
    for (const section of sections) {
      lines.push(`### ${section.title}`, "", section.summary, "");
      for (const item of section.items) {
        lines.push(`- ${item}`);
      }
      if (section.howTo?.length) {
        lines.push("", "**How to**", "");
        section.howTo.forEach((step, index) => {
          lines.push(`${index + 1}. ${step}`);
        });
      }
      if (section.tips?.length) {
        lines.push("");
        for (const tip of section.tips) {
          lines.push(`> ${tip}`);
        }
      }
      lines.push("");
    }
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

/** Escape `{` / `}` so MDX does not treat them as JSX. Leave fenced/inline code intact. */
function escapeMdx(text: string): string {
  return text.replace(/`[^`]*`|[{}]/g, (chunk) => {
    if (chunk.startsWith("`")) return chunk;
    return chunk === "{" ? "\\{" : "\\}";
  });
}

function groupSlug(group: FeatureDocGroup): string {
  return group.toLowerCase();
}

export type GeneratedDocFile = {
  path: string;
  contents: string;
};

/** MDX + meta.json for the Fumadocs site under `docs/site/content/docs`. */
export function featureDocsFumadocsFiles(): GeneratedDocFile[] {
  const files: GeneratedDocFile[] = [];

  files.push({
    path: "meta.json",
    contents: `${JSON.stringify(
      {
        title: "Pulse",
        pages: ["index", ...FEATURE_DOC_GROUPS.map(groupSlug)],
      },
      null,
      2,
    )}\n`,
  });

  const cards = FEATURE_DOC_GROUPS.map((group) => {
    const first = FEATURE_DOC_SECTIONS.find((section) => section.group === group);
    if (!first) return "";
    const blurb = FEATURE_DOC_GROUP_BLURBS[group];
    return `  <Card title="${group}" description=${yamlString(blurb)} href="/docs/${groupSlug(group)}" />`;
  }).join("\n");

  const startHere = [
    ["Send a request", "/docs/workspace/requests"],
    ["Path parameters", "/docs/workspace/path-params"],
    ["Environments", "/docs/data/environments"],
    ["Keyboard shortcuts", "/docs/productivity/search"],
  ]
    .map(([title, href]) => `- [${title}](${href})`)
    .join("\n");

  files.push({
    path: "index.mdx",
    contents: `---
title: ${yamlString("Field guide")}
description: ${yamlString("Local-first desktop API client — the same pages as Docs in the app rail.")}
---

Pulse lives on your machine. This manual is generated from \`src/lib/feature-docs.ts\` — the same source as **Docs** in the app and \`docs/FEATURES.md\`.

![Pulse request workspace](/screenshots/request.png)

## Chapters

<Cards>
${cards}
</Cards>

## Start here

${startHere}
`,
  });

  for (const group of FEATURE_DOC_GROUPS) {
    const sections = FEATURE_DOC_SECTIONS.filter((section) => section.group === group);
    const folder = groupSlug(group);
    const blurb = FEATURE_DOC_GROUP_BLURBS[group];

    files.push({
      path: `${folder}/meta.json`,
      contents: `${JSON.stringify(
        {
          title: group,
          pages: ["index", ...sections.map((section) => section.id)],
        },
        null,
        2,
      )}\n`,
    });

    const groupCards = sections
      .map(
        (section) =>
          `  <Card title=${yamlString(section.title)} description=${yamlString(section.summary)} href="/docs/${folder}/${section.id}" />`,
      )
      .join("\n");

    files.push({
      path: `${folder}/index.mdx`,
      contents: `---
title: ${yamlString(group)}
description: ${yamlString(blurb)}
---

${escapeMdx(blurb)}

<Cards>
${groupCards}
</Cards>
`,
    });

    for (const section of sections) {
      const shot = FUMADOCS_SCREENSHOTS[section.id];
      const lines: string[] = [
        "---",
        `title: ${yamlString(section.title)}`,
        `description: ${yamlString(section.summary)}`,
        "---",
        "",
        escapeMdx(section.summary),
        "",
      ];
      if (shot) {
        lines.push(`![${shot.alt}](${shot.src})`, "");
      }
      lines.push("## In the product", "");
      for (const item of section.items) {
        lines.push(`- ${escapeMdx(item)}`);
      }
      if (section.howTo?.length) {
        lines.push("", "## Walkthrough", "");
        section.howTo.forEach((step, index) => {
          lines.push(`${index + 1}. ${escapeMdx(step)}`);
        });
      }
      if (section.tips?.length) {
        for (const tip of section.tips) {
          lines.push("", "<Callout title=\"Tip\">", "", escapeMdx(tip), "", "</Callout>", "");
        }
      }
      files.push({
        path: `${folder}/${section.id}.mdx`,
        contents: `${lines.join("\n").trimEnd()}\n`,
      });
    }
  }

  return files;
}

