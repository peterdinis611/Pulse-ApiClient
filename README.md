# Pulse API Client

Desktop API client built with **Tauri**, **React**, **TypeScript**, **Tailwind CSS**, **shadcn/ui**, and **Rust** (reqwest).

## Stack

- UI: React + Tailwind CSS v4 + shadcn/ui (Radix + Lucide icons)
- State: XState 5 + @xstate/react
- Desktop: Tauri 2
- HTTP: Rust reqwest

## Features

- HTTP methods: GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS
- Query params, headers, body (none, JSON, raw, form-urlencoded, multipart)
- Auth: Bearer, Basic, API key (header or query)
- Response panel: status, timing, size, body (JSON pretty-print), headers
- Collections: save, duplicate, delete, import/export JSON
- Environments with `{{variable}}` substitution
- Request history (last 50)
- Keyboard shortcut: **Cmd/Ctrl + Enter** to send

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

## Project layout

- `src/` — React UI
- `src/machines/` — XState app machine + `useApp` hook
- `src-tauri/src/http.rs` — HTTP engine (reqwest)
- `src-tauri/src/lib.rs` — Tauri command `send_http_request`
