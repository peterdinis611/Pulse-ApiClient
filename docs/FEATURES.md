# Pulse feature guide

In-app: open **Docs** from the left rail. Generated from `src/lib/feature-docs.ts`. Fumadocs site: `bun run docs:dev`.

## Workspace

### Overview

Home screen for saved requests and recent history — open, copy, or start something new.

- Stats at the top: collections, saved requests, open tabs, history count
- One row per request — click the row to open it in a tab
- Row menu: Open, Copy URL (no dead “more” button)
- Fuzzy search (`Cmd/Ctrl + F`) plus filters for method, collection, and source
- Empty state with New request when the workspace is blank

**How to**

1. Open Overview from the left rail (or `Cmd/Ctrl + Shift + O` for a dedicated window).
2. Type in the search field — matches name, method, and URL.
3. Use the filter menu to narrow by HTTP method or collection.

### HTTP requests

Build and send requests from the Requests workspace.

- Methods: GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS, QUERY
- Tabs: Params, Headers, Body, Auth, Pre-request, Tests, Code
- Body kinds: none, JSON, raw, form-urlencoded, multipart (text or file), GraphQL
- Headers tab includes CORS/browser presets (Origin, Referer, AC-Request-*)
- Desktop engine is not limited by browser CORS — set any header you need
- Send with `Cmd/Ctrl + Enter` (or the Send button); Cancel while in flight
- Name the request, pick a collection and folder, then Save
- Import from cURL via the ⋯ menu on the request bar
- Tabs for parallel requests; duplicate from the explorer
- QUERY is experimental — some proxies and frameworks still reject it

**How to**

1. Focus the URL with `Cmd/Ctrl + L`. Use `{{baseUrl}}/users` with environment variables.
2. Open Params for query and path values, Headers for metadata, Body for the payload.
3. Send, then inspect the response panel. Save to keep the request in a collection.

> Use {{variable}} anywhere in URL, headers, auth, or body — values come from merged variable layers (see Environments).

### Path parameters

Tokens in the URL path become a Path table — like Postman’s Path tab.

- Write `:id` or `{id}` in the path, e.g. `https://api.example.com/users/:id/orders/{orderId}`
- Params → Path lists each name automatically; keys are read-only
- Enabled values replace the tokens on Send (and in the resolved URL preview)
- Query params stay on Params → Query — they are not mixed with path tokens
- `https:` and ports like `:3000` are not treated as params
- OpenAPI `{petId}` paths import as path params; Postman `url.variable` round-trips

**How to**

1. Type the token in the URL bar, then open Params → Path and fill the value.
2. Leave a value empty to keep the token in the request (useful while drafting).
3. Path values can themselves contain `{{variables}}`.

> Prefer `:id` in the path and keep filters (`?status=active`) on the Query table.

### Authentication

Configure auth on the Auth tab of a request, or inherit it from a parent.

- Inherit from collection or folder (default on new requests)
- No Auth — send nothing extra
- Bearer token
- Basic username / password
- API key (header or query)
- OAuth 2.0 — client credentials
- OAuth 2.0 — authorization code with PKCE
- OAuth 2.0 — refresh token flow

**How to**

1. On a request, open Auth and pick a type. Inherit shows which parent supplies the credentials.
2. OAuth 2.0 stays on the request (not on collection/folder settings) — exchange the token there.
3. To override a collection Bearer for one call, switch that request off Inherit and set its own auth.

> Set Bearer once on the collection (explorer → ⋯ → Edit settings). Requests left on Inherit pick it up.

### Collection & folder inheritance

Auth, variables, pre-request, and tests on a parent apply to every child that Inherits.

- Collection settings: auth, variables, pre-request, tests
- Folder settings: same fields, plus Inherit from the parent collection/folder
- Auth resolution: nearest folder with a concrete type, else the collection, else none
- Pre-request runs collection → folders (outer to inner) → request
- Tests run request → folders (inner to outer) → collection
- Folder variables layer after collection variables and before the environment
- New requests default to Inherit so you do not copy Bearer onto every call

**How to**

1. Explorer → collection ⋯ → Edit settings. Choose Bearer (or Basic / API key) and Save.
2. On a folder row, click the settings icon to set folder-only auth or extra scripts.
3. Keep request Auth on Inherit. The Auth tab shows which parent is used.

> A folder set to No Auth stops looking further up — children inherit “none”, not the collection token.

### Code snippets

Copy the current request as client code for an app, a terminal, or a ticket.

- Languages: cURL, JavaScript fetch, Axios, HTTPie, Python requests, Go net/http
- Snippets use the resolved URL (variables + path params) and inherited auth
- Code tab on the request — pick a language and Copy
- Request bar ⋯ → Copy as — same languages without leaving the URL bar
- Import from cURL is still on that ⋯ menu (file with a curl command)

**How to**

1. Send or just fill the request, then open the Code tab.
2. Select fetch / Axios / Python / … and Copy. Paste into the app.
3. Or use ⋯ → Copy as when you only need a one-shot snippet.

### Response panel

Inspect status, timing, size, headers, and body after Send.

- JSON pretty-print for application/json bodies
- Preview for images, PDF, Excel (.xlsx), and CSV
- Download response body to disk
- Headers and timing metadata beside the body
- Empty, loading, and error states are distinct — you always know if a send is in flight

### WebSocket

Connect to ws:// or wss:// endpoints from the request bar.

- Switch protocol to WebSocket (or paste a `ws://` / `wss://` URL)
- Connect / Disconnect replace Send while the socket is active
- Headers, query, path params, and inherited auth apply on connect
- Send text or binary frames; ping; inspect incoming messages

## Scripting

### Pre-request scripts

Run JavaScript before Send to set variables for chaining.

- pulse.environment.set("key", value) — write into the active environment
- pulse.variables.set("key", value) — same as environment.set
- Scripts run on single Send and during collection runs when present
- Parent scripts (collection, then folders) run before the request script
- Mutations write to the real environment, not the merged “globals + collection” view
- Use Templates / snippets on the Pre-request tab to get started

**How to**

1. Open Pre-request on the request (or Edit settings on a collection/folder).
2. Call pulse.environment.set("token", "…") after a login request.
3. Use {{token}} on later requests in the same environment.

> Set a token in request A, then use {{token}} in request B of the same collection run.

### Tests

Assert on the last response with pulse.test scripts.

- pulse.test("name", function () { ... })
- pulse.response.to.have.status(200) · to.be.ok · clientError · serverError
- pulse.response.to.have.header("Content-Type")
- pulse.expect(value).to.eql / include / be.above / match / have.property
- pulse.response.json() · text() · responseTime
- pm.test / pm.expect syntax is auto-normalized to pulse.*
- After Send, tests on the request run, then folder tests (inner → outer), then collection tests
- Collection runner reports passed/failed per request
- Snippets on the Tests tab cover status, headers, body, JSON, GraphQL, and timing

### Console

Bottom console for logs and quick pulse evaluations.

- Toggle from the status bar
- help — list commands
- status · text() · json() · headers · time · size
- Run pulse.test / pulse.expect against the last response

## Data

### Collections

Organize saved requests and run them as a set.

- Save, duplicate, delete, drag-and-drop requests and folders
- Nested folders; empty folders can be deleted
- Run collection — sequential when pre-request scripts exist, otherwise can batch
- Runner uses the same inheritance and variable layers as a single Send
- Import Pulse JSON, Postman v2.1, Bruno, Insomnia, OpenAPI
- Export one collection as Pulse or Postman (⋯ menu), or the whole workspace
- Postman import/export keeps collection and folder auth, variables, and scripts
- OpenAPI `{id}` paths become path params; operations land as requests

**How to**

1. Save from the request bar (collection + optional folder).
2. Play icon on a collection runs every request; View results for status and tests.
3. Explorer transfer menu imports a file; collection ⋯ exports Pulse or Postman JSON.

### Variables & environments

Layered values: globals → collection → folder → environment. Later layers win on the same name.

- Globals — lowest precedence, shared across collections (Environments view, first chip)
- Collection and folder variables — set in Edit settings
- Environment variables — Local / staging / production; switch from the explorer or status bar
- Active environment wins when the same key exists in an earlier layer
- Secret — mask the current value in the UI (bullets)
- Initial vs current — snapshot plus Reset current from initial
- {{name}} substitution in URL, path, query, headers, auth, and body
- Autocomplete and the `{ }` picker list the merged enabled variables
- pulse.environment.set updates the real environment (current value), not globals

**How to**

1. Open Environments in the rail. Edit Globals, or select an environment chip.
2. Mark tokens and passwords as secret. Fill Initial once, then change Current per session.
3. Put `baseUrl` on the environment and `{{baseUrl}}/users/:id` on the request.

> Do not type secrets into collection JSON you plan to export and share — use environment or secret globals locally.

### History

Past sends stored in SQLite with search.

- Paginated history in the explorer (grouped by day, stacked consecutive runs)
- Also listed on Overview
- Fuzzy search across method, URL, and name
- Reload a past request into a tab; preview without opening
- Clear history from the explorer or Settings → Data

### Cookie jar

Inspect and edit cookies used by the HTTP engine.

- Settings → Cookie jar — list, add, edit, delete
- Clear entire jar
- Settings → HTTP engine — send/store cookie toggles
- Cookies live with the desktop HTTP engine for the app session

### HTTP engine & CORS probing

Native reqwest client — CORS does not apply; configure TLS, proxy, redirects, and default Origin/Referer.

- Settings → HTTP engine — concurrency, timeouts, cache (memory + disk)
- TLS verify on/off (self-signed / local HTTPS)
- HTTP(S) or SOCKS proxy URL
- Follow redirects + max redirects
- Default User-Agent, Origin, Referer
- Send / store cookies toggles
- Engine stats: active, completed, failed, cache hits

> Pulse is not a browser: there is no CORS preflight. Use Origin/Referer headers (or Settings defaults) to reproduce what a browser would send.

## Appearance

### Themes & custom CSS

Appearance lives under Settings → Appearance.

- Built-in themes via the theme picker
- Custom CSS editor with snippets, CSS variables, and component hooks
- Live preview while editing
- Starter template, full example file, Apply, Export, Browse, Reload, Clear
- Example file: examples/pulse-theme-override.example.css

## Productivity

### Search & shortcuts

Find requests quickly and stay on the keyboard.

- Fuzzy search in the explorer and Overview
- `Cmd/Ctrl + Enter` — Send
- `Cmd/Ctrl + T` — new request tab
- `Cmd/Ctrl + W` — close tab
- `Cmd/Ctrl + L` — focus URL
- `Cmd/Ctrl + F` — search explorer or Overview
- `Cmd/Ctrl + B` — toggle explorer
- `Cmd/Ctrl + Shift + N` — new window
- `Cmd/Ctrl + Shift + O` — overview window
- Cheat sheet also lives in Settings → Layout

### Data & privacy

Workspace data is local to your account on this device.

- SQLite per user: workspace, history, HTTP cache
- Settings — export collections, reset database, clear cache
- Sign in keeps a separate auth database from workspace data
- No Pulse cloud — collections stay on disk unless you export them
