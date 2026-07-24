# Pulse API Client

Desktop API client built with **Tauri**, **React**, **TypeScript**, **Tailwind CSS**, **shadcn/ui**, and **Rust** (reqwest).

![Pulse request workspace](./docs/screenshots/request.png)

## Stack

- UI: React + Tailwind CSS v4 + shadcn/ui (Linear-inspired layout)
- State: XState 5 + @xstate/react
- Desktop: Tauri 2
- HTTP: Rust reqwest
- Storage: SQLite per user (workspace, history, cache)

## Features

- HTTP methods: GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS
- Query params, headers, body (none, JSON, raw, form-urlencoded, multipart)
- Auth: Bearer, Basic, API key, OAuth 2.0 (client credentials + authorization code / PKCE)
- Pre-request scripts with `pulse.environment.set` for collection chaining
- Response panel: status, timing, size, body (JSON pretty-print), headers; preview for images, PDF, Excel/CSV + download
- Collections: save, duplicate, delete, import/export JSON, Postman, Bruno, Insomnia & OpenAPI
- Environments with `{{variable}}` substitution
- Request history in SQLite with search and pagination
- Cookie jar editor (add / edit / delete)
- Custom themes + optional custom CSS overlay
- WebSocket client, collection runner, fuzzy search
- Keyboard shortcut: **Cmd/Ctrl + Enter** to send

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

## Build

```bash
bun run tauri build
```

## Regenerate README screenshots

```bash
bun install
bunx playwright install chromium
bun run screenshots:readme
```

## Project layout

- `src/` — React UI
- `src/machines/` — XState app machine + `useApp` hook
- `src-tauri/src/http.rs` — HTTP engine (reqwest)
- `src-tauri/src/history.rs` — SQLite request history
- `src-tauri/src/lib.rs` — Tauri commands
- `docs/screenshots/` — README screenshots
- `examples/pulse-theme-override.example.css` — sample custom CSS (all theme tokens + UI hooks)

## Custom theme CSS

Settings → Appearance → Custom CSS can overlay any built-in theme.

1. Click **Load example file** (or open `examples/pulse-theme-override.example.css`)
2. Click **Apply CSS** to see a coral showcase theme
3. Edit tokens / comment sections you do not need

The example covers surfaces, chrome (sidebar/rail/topbar/console), status + method colors, fonts/radius, per-theme `html[data-theme="…"]` scopes, and component classes.
