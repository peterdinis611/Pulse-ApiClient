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
      "Examples tab — save any number of response snapshots; Git writes them as `examples` on `*.pulse.yaml`",
      "Save example stores the last response on the request (Examples tab) — a snapshot of how a 200 should look",
      "Import from cURL via the ⋯ menu on the request bar",
      "Protocol picker: HTTP, WebSocket, or SSE (server-sent events)",
      "GraphQL body includes a schema explorer (Introspect the current URL)",
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
      "Diff the current body against a saved example (red = example, green = current)",
      "JSON Schema on the Tests tab — Send asserts 2xx and validates the body",
      "Headers and timing metadata beside the body",
      "Empty, loading, and error states are distinct — you always know if a send is in flight",
    ],
  },
  {
    id: "websocket",
    title: "WebSocket & SSE",
    summary: "Stream protocols on the request bar: WebSocket frames or text/event-stream.",
    group: "Workspace",
    items: [
      "Protocol picker: HTTP, WS, or SSE — or paste a `ws://` / `wss://` URL for WebSocket",
      "SSE uses `http://` / `https://` with `Accept: text/event-stream` (AI streams, logs, ticks)",
      "Connect / Disconnect replace Send while the stream is active",
      "Headers, query, path params, and inherited auth apply on connect",
      "WebSocket: send text or binary frames; ping; inspect incoming messages",
      "GraphQL subscriptions: set body to GraphQL on a `ws://` request — Pulse negotiates `graphql-transport-ws` and can send subscribe frames",
      "SSE is incoming-only — events land in the same message list, no send/ping",
    ],
    howTo: [
      "Switch protocol to SSE, set the events URL, Connect. Data lines show as incoming messages.",
      "For WebSocket, use `wss://…` or pick WS, then Connect and send frames.",
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
      "Live progress in the explorer: request name, status, elapsed ms, and a bar (same events MCP already emits)",
      "Run folder — Play on a folder sends that folder and its nested requests only",
      "Data file — CSV or JSON, one row = one full iteration of the collection or folder",
      "Runner uses the same inheritance and variable layers as a single Send",
      "Import Pulse JSON, Postman v2.1, Bruno, Insomnia, OpenAPI",
      "OpenAPI explorer in the explorer transfer menu — fetch a spec, click an operation, open it as a request (save writes YAML when Git is attached)",
      "Export one collection as Pulse, Postman, Bruno, Insomnia, or OpenAPI 3.0 (⋯ menu), or the whole workspace",
      "OpenAPI import attaches JSON Schema from 200/201 when present; Send asserts 2xx vs that schema",
      "Collections folder — Settings → Data: attach a Git directory; YAML tree is the workspace (one `*.pulse.yaml` per request)",
      "Migrate leftover `*.pulse.json` dumps into the YAML tree from Settings → Data",
      "Postman import/export keeps collection and folder auth, variables, and scripts",
      "OpenAPI `{id}` paths become path params; operations land as requests",
    ],
    howTo: [
      "Save from the request bar (collection + optional folder).",
      "Play on a collection runs every request; Play on a folder runs that folder. View results for status and tests.",
      "Spreadsheet icon (or Run with CSV / JSON) picks a data file: each row becomes `{{column}}` for one iteration.",
      "Explorer transfer menu imports a file; collection ⋯ exports Pulse, Postman, Bruno, Insomnia, or OpenAPI JSON.",
      "Settings → Data → Attach folder opens a Git workspace (`pulse.yaml`, `collections/`, `environments/`). SQLite keeps history, cache, and session only.",
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
      "{{secret.name}} reads gitignored `.env` (and the OS keychain overlay) — values are never written into YAML",
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
      "Do not type secrets into collection YAML you plan to commit — use `{{secret.*}}`, `.env`, or the keychain.",
    ],
  },
  {
    id: "git-workspace",
    title: "Git workspace",
    summary: "When a folder is attached, YAML files are the source of truth. SQLite is history, cache, session, and local secrets overlay.",
    group: "Data",
    items: [
      "Layout: `pulse.yaml`, `collections/<name>/collection.yaml`, one `*.pulse.yaml` per request, `environments/*.yaml`",
      "Attach folder from Settings → Data — Pulse inits `.gitignore` and `.env.example`",
      "Notify watch reloads a request from disk; a dirty tab shows a line-diff instead of silent overwrite",
      "Secrets stay in gitignored `.env` / OS keychain as `{{secret.*}}` — never in request YAML or history JSON",
      "JSON remains import/export (Postman, Pulse dump), not the native Git format",
      "Detached mode (no folder) still uses the SQLite workspace for history, cache, and session",
    ],
    howTo: [
      "Settings → Data → Attach folder. Pick the Git repo that should hold collections.",
      "Save a request — Pulse writes `collections/…/name.pulse.yaml`. Commit that file.",
      "Put tokens in `.env` as `API_TOKEN=…` and reference `{{secret.API_TOKEN}}` on the Auth tab.",
    ],
    tips: [
      "Migrate old `*.pulse.json` dumps with Migrate on the same Settings row.",
    ],
  },
  {
    id: "mock-server",
    title: "Local mock server",
    summary: "Lock 127.0.0.1:4010 and replay every saved response example. Only headers from the example go on the wire.",
    group: "Data",
    items: [
      "Settings → Data → Start mock binds 127.0.0.1:4010 and fails if that port is already taken",
      "Optional base delay (ms) on Start; per-request `?delay=80` overrides (max 60s)",
      "One route per saved example (not only the first) — same method and path, different bodies and statuses",
      "`?example=name` picks a snapshot by Examples-tab name; `?status=404` picks by status",
      "Without a query, Pulse serves the first 2xx example, then the first example",
      "Response headers are only those stored on the example — no Server, Date, Connection, Content-Length, or X-Pulse-*",
      "Content-Type is sent only when the example has one",
      "Git YAML stores `examples` plus a legacy `example` string (first 2xx body) for contract checks",
    ],
    howTo: [
      "Save 200 and 404 snapshots on a request (Examples tab), then Settings → Data → Start mock.",
      "Call `http://127.0.0.1:4010/pets` for the 2xx body, or `…/pets?example=missing` / `…/pets?status=404` / `…/pets?delay=120`.",
      "Stop from the same Settings row before starting again on :4010.",
    ],
    tips: [
      "The mock never invents headers. The desktop HTTP client also sends no default User-Agent unless you set one.",
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
      "Export loaded history as HAR 1.2 from the explorer (request + status/timing; body not stored)",
      "Source badge: desktop, agent (MCP), or cli",
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
      "mTLS — client certificate, key, and CA PEM via file picker (like custom CSS)",
      "HTTP(S) or SOCKS proxy URL",
      "Follow redirects + max redirects",
      "User-Agent, Origin, Referer only when you set them — empty means Pulse sends none (no reqwest defaults)",
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
    title: "Themes, language & custom CSS",
    summary: "Appearance lives under Settings → Appearance.",
    group: "Appearance",
    items: [
      "Built-in themes via the theme picker",
      "First-run setup asks for language, theme, start view, and explorer visibility — replay from Settings → Appearance",
      "UI language: Match system, English, or Slovenčina",
      "Custom language pack: upload or paste a JSON object of key → string overrides",
      "Missing language keys fall back to the built-in locale, then English",
      "Example file: examples/pulse-language.en.json",
      "Custom CSS editor with snippets, CSS variables, and component hooks",
      "Live preview while editing",
      "Starter template, full example file, Apply, Export, Browse, Reload, Clear",
      "Example file: examples/pulse-theme-override.example.css",
    ],
    howTo: [
      "On first launch, pick a language and theme, then how the desk opens. Finish writes the same values Settings already uses.",
      "Open Settings → Appearance. Pick Match system, English, or Slovenčina. Replay First-run setup from that row.",
      "Optional: Browse or paste a JSON language pack (see examples/pulse-language.en.json). Missing keys fall back to the language you picked.",
    ],
  },
  {
    id: "search",
    title: "Search & shortcuts",
    summary: "Find requests quickly and stay on the keyboard.",
    group: "Productivity",
    items: [
      "Fuzzy search in the explorer and Overview",
      "`Cmd/Ctrl + K` — command palette (jump to request, collection, setting, docs, What's new, product tour, first-run setup)",
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
    id: "whats-new",
    title: "What's new & product tour",
    summary: "Each app version opens a changelog once. Driver.js then walks the new controls.",
    group: "Productivity",
    items: [
      "On first launch of a new version, Pulse shows a What's new card with that release's changes",
      "Walk through starts a Driver.js tour: first-run setup, Git folder, mock server, OpenAPI explorer, secrets, WebSocket/GraphQL, Docs",
      "Got it dismisses the card and stores the seen version locally — it will not appear again until the next version",
      "Replay from Settings → Appearance (setup) or Settings → Data (What's new / tour), or the command palette",
      "Add a changelog block in `src/lib/changelog.ts` before bumping `package.json`",
    ],
    howTo: [
      "After an update, read the notes, then Walk through to highlight the new UI.",
      "Settings → Data → What's new / Product tour to replay notes. Settings → Appearance → First-run setup to replay language and theme.",
    ],
  },
  {
    id: "data",
    title: "Data & privacy",
    summary: "Workspace data is local to your account on this device.",
    group: "Productivity",
    items: [
      "SQLite per user: history, HTTP cache, and UI session (collections live on disk when a Git folder is attached)",
      "Settings — export collections, reset database, clear cache",
      "Sign in keeps a separate auth database from workspace data",
      "No Pulse cloud — collections stay on disk unless you export them or sync a Git folder",
      "Settings → Data → Attach folder uses YAML as the canonical Git workspace; Write/Reload of `*.pulse.json` is no longer the primary flow",
      "File pickers (custom CSS, language pack, mTLS PEMs, runner data, collections folder) are OS-agnostic — no hardcoded `~/Library` paths",
    ],
    tips: [
      "Linux AppImage and .deb need webkit2gtk 4.1 at runtime, not only when compiling. Install `libwebkit2gtk-4.1-0` (Debian/Ubuntu) if the window fails to open.",
    ],
  },
  {
    id: "privacy",
    title: "Privacy policy",
    summary:
      "Pulse does not operate a cloud. Your workspace stays on this device unless you send a request, share a Git repo, or export a file yourself.",
    group: "Productivity",
    items: [
      "Effective 19 September 2026. This policy describes the Pulse desktop app, CLI, and MCP satellite — not the APIs you call.",
      "No Pulse account in the cloud. Sign-in is a local SQLite auth database (name, email, password hash) on this machine.",
      "Workspace data (collections, environments, history, cookies, HTTP cache, window session) is stored locally. With a Git folder attached, collections live in YAML on disk; SQLite keeps history, cache, and session.",
      "Pulse does not phone home: no telemetry, crash reports, analytics, or ads to Pulse servers. There is no Pulse operator that receives your collections.",
      "HTTP, GraphQL, WebSocket, and SSE traffic goes only to URLs you enter (or that an MCP/CLI run you started enters). Those destinations have their own policies.",
      "Secrets: `{{secret.*}}` values come from a gitignored `.env` and the OS keychain. They are stripped from YAML and redacted from history JSON. Do not commit `.env`.",
      "The cookie jar holds cookies for APIs you called — not Pulse tracking cookies.",
      "MCP (`pulse_send`, collection runs) writes agent history locally (`source=agent`) and requires `confirm=true` before POST/PUT/PATCH/DELETE.",
      "Export, Git push, and file copies are under your control. Anyone with the files can read non-secret request definitions.",
      "To delete local data: Settings → Data → clear history, clear cache, or reset the database; detach the Git folder; delete the app data directory and `.env` if you want a full wipe.",
      "Pulse is not directed at children. It does not collect personal data over the network for Pulse’s own purposes.",
      "We do not sell personal data. Pulse never receives it. Third parties are only the APIs, Git hosts, and MCP clients you choose.",
    ],
    howTo: [
      "Read this page in-app (Docs → Privacy policy) or on the field-manual site at `/docs/productivity/privacy`.",
      "Keep tokens out of Git: `.env` + `{{secret.NAME}}` on Auth, or the OS keychain.",
      "Wipe this device copy from Settings → Data when you are done with a workspace.",
    ],
    tips: [
      "If you self-host docs or redistribute Pulse, keep this policy with the app. Changing network behavior (telemetry, accounts, sync) would require an updated policy.",
    ],
  },
  {
    id: "python-cli",
    title: "Python CLI & CI",
    summary: "Satellite around the Rust engine — collection runs, benches, OpenAPI/HAR import. Not inside the desktop app.",
    group: "Productivity",
    items: [
      "`bun run pulse:cli run collection.json` — Pulse export or CollectionRunInput, optional `.env` / CSV iterations",
      "`bun run pulse:cli contract path/to/workspace` — validate Git YAML examples vs responseSchema and `*.previous.json` snapshots",
      "JUnit XML and a p50/p95 timing summary for GitHub Actions",
      "`bench` repeats a collection and fails if p95 exceeds a budget or a previous baseline",
      "OpenAPI import fills path params, query, JSON examples, tag folders, and a 2xx status test",
      "HAR capture → Pulse collection; Pulse dump / history → HAR (`har --export`); JSON Schema subset for response bodies",
      "`curl`, `diff`, and `snippet` subcommands (same helpers MCP already uses)",
      "HTTP still goes through Rust (`pulse_native`); Python only prepares inputs and reports",
    ],
    howTo: [
      "First `bun run tauri dev` (or `bun run pulse:cli:install`) builds the PyO3 module into `.venv`.",
      "Export a collection from Pulse, then `bun run pulse:cli run pets.json --env-file staging.env --summary --junit junit.xml`.",
      "`bun run pulse:cli curl 'curl -X POST https://api.test -d {\"a\":1}'` or `snippet --url https://api.test --format python`.",
      "Keep a `bench.json` from a good run and compare with `--baseline bench.json --factor 1.2`.",
    ],
  },
  {
    id: "mcp",
    title: "MCP",
    summary: "Cursor (and other MCP clients) call the Pulse engine over stdio via one Python server — send, GraphQL, cURL, collections, bench, OpenAPI, Git workspace, contract, JUnit.",
    group: "Productivity",
    items: [
      "Project config: `.cursor/mcp.json` launches **pulse** only (`python/pulse_mcp.py`) — covers OpenAPI/HAR plus YAML workspace tools",
      "Set `PULSE_WORKSPACE` to the same Git folder the desktop attached",
      "Resources: `pulse://examples/pets.json`, `pulse://last-run`, `pulse://openapi/{file}`, `pulse://out/{file}`, `pulse://workspace/requests|environments|history|pending`, `pulse://workspace/request/{id}`",
      "Tools: pulse_workspace_list/read/write/send/envs/history/pending/search/delete/status/import_openapi/export_openapi, pulse_send (mutating methods need confirm=true), pulse_run_collection, pulse_bench, pulse_write_collection, pulse_pre_request, pulse_interpolate, pulse_run_tests, pulse_openapi, pulse_har, pulse_schema, pulse_diff, pulse_export_openapi, pulse_graphql, pulse_curl, pulse_snippet (curl/fetch/httpie/python/axios), pulse_last_run, pulse_validate_run, pulse_contract, pulse_junit, pulse_help",
      "Prompts: run_and_explain, openapi_to_pulse, compare_responses, graphql_introspect, curl_import, export_openapi, explain_last_run, validate_schema, send_saved_request, workspace_status, contract_check, import_openapi_workspace",
      "Long collection runs and bench emit MCP progress (request name, status, ms) after each step",
      "OpenAPI/HAR write to `python/examples/.out/` and return a POSIX path — not a huge JSON blob",
      "Same engine as the CLI — not inside the Tauri window",
      "Install once with `bun run pulse:cli:install`, then reload Cursor MCP",
    ],
    howTo: [
      "Run `bun run pulse:cli:install` so `.venv` has `pulse_native`.",
      "Reload Cursor. In Settings → MCP, enable **pulse** if it is listed as disabled.",
      "Ask the agent to send a saved YAML request (`pulse_workspace_send`), list Git workspace status, or convert OpenAPI into `*.pulse.yaml`.",
      "Built-in prompts cover collection runs, OpenAPI import/export into JSON or the Git folder, GraphQL introspection, cURL import, last-run summary, schema validation, contract check, and comparing two JSON responses (`pulse_diff`).",
      "OpenAPI conversion writes `python/examples/.out/…json` or YAML under `PULSE_WORKSPACE/collections/`; read `pulse://last-run` / `pulse://workspace/*` after a run. Generated files are also `pulse://out/{file}`.",
    ],
  },
  {
    id: "libraries",
    title: "Libraries & stack",
    summary: "Direct dependencies — desktop UI, Rust engine, Python satellite, and the docs site. Versions live in package.json / Cargo.toml.",
    group: "Productivity",
    items: [
      "UI — React 19, React DOM, TypeScript, Vite, Tailwind CSS v4 (`@tailwindcss/vite`)",
      "Components — shadcn/ui on Radix (alert-dialog, avatar, checkbox, collapsible, dropdown-menu, label, scroll-area, select, separator, slot, tabs, tooltip)",
      "UI helpers — lucide-react, class-variance-authority, clsx, tailwind-merge, sonner toasts",
      "State & effects — XState 5, @xstate/react, Effect",
      "Desktop bridge — @tauri-apps/api, @tauri-apps/plugin-dialog, @tauri-apps/plugin-opener",
      "Workspace UX — @tanstack/react-hotkeys, @tanstack/react-pacer, fuse.js (fuzzy search), xlsx (Excel preview / runner data)",
      "Desktop crate (`src-tauri`) — Tauri 2, tauri-plugin-dialog, tauri-plugin-opener, reqwest (rustls, JSON, multipart, cookies, SOCKS, stream), tokio, tokio-tungstenite, tokio-util, futures-util, rusqlite (bundled), moka, serde / serde_json, url, base64, sha2, regex, fuzzy-matcher, notify, keyring, pulse-core",
      "Engine crate (`crates/pulse-core`) — boa_engine (JS tests / pre-request), reqwest, tokio, serde, serde_yaml, regex, url, base64",
      "MCP crate (`crates/pulse-mcp`) — stdio JSON-RPC on pulse-core (YAML workspace send/search/history/pending/envs/contract + HTTP)",
      "Python binding (`crates/pulse-native`) — PyO3 (abi3-py310) around pulse-core",
      "Python package (`python/pulse`) — stdlib only: openapi, har, schema, runner, bench, junit, export, envfile, report, curl, diff, graphql, snippet, workspace (PULSE_WORKSPACE YAML), MCP protocol / tools / prompts / resources",
      "Optional Python — PyYAML (OpenAPI YAML), schemathesis (`python/tools/schemathesis_pulse.py`), maturin to build pulse_native",
      "Docs site (`docs/site`) — Next.js, Fumadocs (core, MDX, UI), lucide-react, cnfast",
      "Tests — Vitest (UI), wiremock (Rust HTTP), Python unittest",
    ],
    howTo: [
      "Frontend versions: `package.json`. Desktop/engine versions: `src-tauri/Cargo.toml` and `crates/*/Cargo.toml`.",
      "Python modules: `python/pulse/` (no extra pip packages for the CLI itself).",
      "Field-manual site packages: `docs/site/package.json`.",
    ],
    tips: [
      "The Tauri window does not embed CPython. CLI and MCP talk to the same Rust engine through `pulse_native`.",
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
  Data: "Collections, environments, history, cookies, the HTTP engine, and the local mock server.",
  Appearance: "Built-in themes, UI language, and CSS / JSON overlays for chrome.",
  Productivity: "Search, shortcuts, what's new, privacy, libraries, the Python CI satellite, and what stays on this machine.",
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

