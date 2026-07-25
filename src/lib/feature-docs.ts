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
  tips?: string[];
};

/** In-app + markdown source of truth for Pulse feature docs. */
export const FEATURE_DOC_SECTIONS: FeatureDocSection[] = [
  {
    id: "requests",
    title: "HTTP requests",
    summary: "Build and send requests from the Requests workspace.",
    group: "Workspace",
    items: [
      "Methods: GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS, QUERY",
      "Query params, headers, and body: none, JSON, raw, form-urlencoded, multipart",
      "Send with Cmd/Ctrl + Enter (or the Send button)",
      "Protocol switch: HTTP or WebSocket (ws:// / wss://)",
      "Tabs for parallel requests; duplicate and rename from the explorer",
    ],
    tips: [
      "Use {{variable}} anywhere in URL, headers, auth, or body — values come from the active environment.",
    ],
  },
  {
    id: "auth",
    title: "Authentication",
    summary: "Configure auth on the Auth tab of a request.",
    group: "Workspace",
    items: [
      "Bearer token",
      "Basic username / password",
      "API key (header or query)",
      "OAuth 2.0 — client credentials",
      "OAuth 2.0 — authorization code with PKCE",
      "OAuth 2.0 — refresh token flow",
    ],
  },
  {
    id: "response",
    title: "Response panel",
    summary: "Inspect status, timing, size, headers, and body.",
    group: "Workspace",
    items: [
      "JSON pretty-print for application/json bodies",
      "Preview for images, PDF, Excel (.xlsx), and CSV",
      "Download response body to disk",
      "Headers and timing metadata beside the body",
    ],
  },
  {
    id: "websocket",
    title: "WebSocket",
    summary: "Connect to ws:// or wss:// endpoints from the request bar.",
    group: "Workspace",
    items: [
      "Switch protocol to WebSocket",
      "Connect / Disconnect controls replace Send while connected",
      "Headers and query from the request are applied on connect",
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
      "Use Templates / snippets on the Pre-request tab to get started",
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
      "pm.test / pm.expect syntax is auto-normalized to pulse.*",
      "Run tests from the Tests tab or after Send when scripts are attached",
    ],
  },
  {
    id: "console",
    title: "Console",
    summary: "Bottom console for logs and quick pulse evaluations.",
    group: "Scripting",
    items: [
      "Toggle from the status bar",
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
      "Save, duplicate, delete requests and folders",
      "Import / export Pulse JSON",
      "Import Postman, Bruno, Insomnia, and OpenAPI",
      "Collection runner — sequential Send with pre-request scripts and tests",
      "Export menus for sharing collections",
    ],
  },
  {
    id: "environments",
    title: "Environments",
    summary: "Named sets of variables for local / staging / production.",
    group: "Data",
    items: [
      "Create and switch environments from the Environments view or status bar",
      "{{name}} substitution in URL, params, headers, auth, and body",
      "Variables can be updated at runtime via pre-request scripts",
    ],
  },
  {
    id: "history",
    title: "History",
    summary: "Past sends stored in SQLite with search.",
    group: "Data",
    items: [
      "Paginated history in the explorer and Overview",
      "Fuzzy search across method, URL, and name",
      "Reload a past request into a tab",
      "Clear history from Settings when needed",
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
      "Cookies persist with the desktop HTTP engine (reqwest)",
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
      "Cmd/Ctrl + Enter — Send",
      "Cmd/Ctrl + B — toggle explorer",
      "Cmd/Ctrl + Shift + N — new window",
      "Cmd/Ctrl + Shift + O — overview window",
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

export function featureDocsMarkdown(): string {
  const lines: string[] = [
    "# Pulse feature guide",
    "",
    "In-app: open **Docs** from the left rail.",
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
