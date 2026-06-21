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
- Auth: Bearer, Basic, API key (header or query)
- Response panel: status, timing, size, body (JSON pretty-print), headers
- Collections: save, duplicate, delete, import/export JSON, Postman & OpenAPI
- Environments with `{{variable}}` substitution
- Request history in SQLite with search and pagination
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
