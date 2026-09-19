# Pulse API Client

Desktop API client **2.0** — Git YAML is the workspace, SQLite keeps history. Built with **Tauri**, **React**, **TypeScript**, **Tailwind CSS**, **shadcn/ui**, and **Rust** (reqwest).

![Pulse request workspace](./docs/screenshots/request.png)

## Stack

Full library list (in-app **Docs → Libraries & stack**, or [docs/FEATURES.md](./docs/FEATURES.md)).

- UI: React 19, TypeScript, Vite, Tailwind CSS v4, shadcn/ui (Radix), lucide-react, sonner
- State: XState 5 + Effect
- Desktop: Tauri 2 (`plugin-dialog`, `plugin-opener`)
- HTTP / streams: Rust reqwest (rustls, cookies, SOCKS, SSE stream) + tokio-tungstenite
- Scripts: boa_engine (JS tests and pre-request)
- Search: fuse.js (UI) + fuzzy-matcher (Rust)
- Storage: rusqlite (bundled SQLite) per user — workspace, history, cache
- Python satellite: PyO3 `pulse_native` + stdlib `python/pulse` (OpenAPI, HAR, schema, MCP)
- Docs site: Next.js + Fumadocs

## First-run setup

A blank install opens a three-step wizard: **language**, **theme**, then **how the desk opens** (Overview vs Requests, explorer hidden or not). Finish writes the same values Settings already uses.

- Replay anytime: Settings → Appearance → **First-run setup**, or the command palette (`Cmd/Ctrl + K`)
- Change later without the wizard: Appearance (language, theme) and Layout (start view, explorer)
- Existing installs that already have a last-seen version skip the wizard so they are not interrupted
- After first-run, Pulse may still show **What's new** for 2.0, then a Driver.js product tour

## Features

See the full guide in [docs/FEATURES.md](./docs/FEATURES.md) (in-app under **Docs**, or `bun run docs:dev` for the Fumadocs site).

- HTTP methods: GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS, QUERY
- Path params (`:id` / `{id}`), query params, headers, body (JSON, raw, form, multipart, GraphQL)
- Auth: Inherit (collection/folder), Bearer, Basic, API key, OAuth 2.0 (client credentials + PKCE)
- Variables: globals → collection → folder → environment; secrets via `{{secret.*}}` (never written to YAML)
- Git workspace: attach a folder — `pulse.yaml`, `collections/*.pulse.yaml`, `environments/` are canonical
- Local mock server locked to `127.0.0.1:4010` — every saved example is a route (`?example=` / `?status=`); no hidden headers
- Code snippets: cURL, fetch, Axios, HTTPie, Python requests, Go
- Pre-request scripts with `pulse.environment.set` for collection chaining
- Response panel: status, timing, size, body (JSON pretty-print), headers; preview for images, PDF, Excel/CSV + download
- Collections: save, folders, inheritance, runner, import/export Pulse, Postman, Bruno, Insomnia & OpenAPI
- Request history in SQLite with search and pagination
- Cookie jar editor (add / edit / delete)
- Custom themes + optional custom CSS overlay
- WebSocket client, collection runner, fuzzy search
- MCP: Rust `pulse-mcp` (stdio JSON-RPC) plus the Python satellite for OpenAPI/HAR
- In-app **Docs** covering every feature (How to steps included)
- Keyboard shortcuts: **Cmd/Ctrl + Enter** send, **T** new tab, **W** close tab, **L** focus URL, **F** search, **B** explorer, **J** console

## Screenshots

| Overview | Request workspace |
| --- | --- |
| ![Overview](./docs/screenshots/overview.png) | ![Request](./docs/screenshots/request.png) |

| Settings & themes | Sign in |
| --- | --- |
| ![Settings](./docs/screenshots/settings.png) | ![Auth](./docs/screenshots/auth.png) |

## Run

```bash
cd api-client
bun install
bun run tauri dev
```

### Windows

- [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/) (preinstalled on Windows 11)
- [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with the “Desktop development with C++” workload
- Shortcuts in the UI show **Ctrl+** (for example Ctrl+B, Ctrl+Enter)

### Linux

Build **and** runtime need WebKitGTK 4.1, not only the `-dev` packages used to compile:

```bash
# Debian / Ubuntu
sudo apt-get install -y \
  libwebkit2gtk-4.1-dev \
  libwebkit2gtk-4.1-0 \
  libgtk-3-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  patchelf
```

AppImage and `.deb` on some distros fail at launch if `libwebkit2gtk-4.1-0` is missing even after a successful CI build. Fedora/Arch equivalents: `webkit2gtk4.1` / `webkit2gtk-4.1`.

The window uses the default OS titlebar on Windows and Linux. macOS traffic-light overlay, if added later, stays behind `cfg(target_os = "macos")`.

File pickers (custom CSS, runner data files) go through the OS dialog and Rust `PathBuf` — nothing hardcodes `~/Library`.

## Build

```bash
bun run tauri build
```

Dev rebuilds share one Cargo `target/` (workspace). Skip fat debuginfo on dependencies. Production frontend skips `tsc` (`bun run typecheck` still runs in CI).

CI (`.github/workflows/ci.yml`) runs `bun run test`, `bun run typecheck`, `cargo test`, and `tauri build` on `macos-latest`, `ubuntu-latest`, and `windows-latest`.

## Tests

```bash
bun run test
cargo test
bun run pulse:cli:test
```

Vitest covers the UI libs (onboarding, mock routes, layout, i18n). `cargo test` covers `pulse-core` (YAML workspace, mock bind on `:4010`). Python tests cover the satellite CLI and MCP.

## Docs site (Fumadocs)

```bash
bun run docs:dev
```

Opens a Fumadocs site at http://localhost:3000. Content is generated from `src/lib/feature-docs.ts` into `docs/site/content/docs`. `bun run docs:sync` rewrites `docs/FEATURES.md` and those MDX files.

## Regenerate README screenshots

```bash
bun install
bunx playwright install chromium
bun run screenshots:readme
```

## Project layout

- `src/` — React UI (onboarding, Settings, mock controls)
- `src/__tests__/` — Vitest unit tests
- `src/machines/` — XState app machine + `useApp` hook
- `crates/pulse-core/` — YAML workspace, mock server, HTTP helpers
- `src-tauri/src/http.rs` — HTTP engine (reqwest)
- `src-tauri/src/history.rs` — SQLite request history
- `src-tauri/src/lib.rs` — Tauri commands
- `python/` — satellite CLI, MCP, `examples/git-workspace`
- `docs/screenshots/` — README screenshots
- `docs/FEATURES.md` — feature guide (synced with in-app Docs)
- `docs/site/` — Fumadocs Next.js site (`bun run docs:dev`)
- `examples/pulse-theme-override.example.css` — sample custom CSS (all theme tokens + UI hooks)

## Custom theme CSS

Settings → Appearance → Custom CSS can overlay any built-in theme.

1. Use **Snippets** / **CSS variables** / **Component hooks** for quick edits
2. Optionally enable **Live preview** while typing
3. Click **Apply CSS** to persist (or **Export** a `.css` file)
4. **Full example** loads `examples/pulse-theme-override.example.css`

The example covers surfaces, chrome (sidebar/rail/topbar/console), status + method colors, fonts/radius, per-theme `html[data-theme="…"]` scopes, and component classes.
