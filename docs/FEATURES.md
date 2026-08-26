# Pulse feature guide

In-app: open **Docs** from the left rail.

## Workspace

### HTTP requests

Build and send requests from the Requests workspace.

- Methods: GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS, QUERY
- Query params, path params (`:id` / `{id}`), headers, and body: none, JSON, raw, form-urlencoded, multipart
- Headers tab includes CORS/browser presets (Origin, Referer, AC-Request-*)
- Desktop engine is not limited by browser CORS — set any header you need
- Send with Cmd/Ctrl + Enter (or the Send button)
- Code tab — copy as cURL, fetch, Axios, HTTPie, Python requests, or Go
- Protocol switch: HTTP or WebSocket (ws:// / wss://)
- Tabs for parallel requests; duplicate and rename from the explorer

> Use {{variable}} anywhere in URL, headers, auth, or body — values come from the active environment.

### Authentication

Configure auth on the Auth tab of a request.

- Inherit from collection or folder (default on new requests)
- Bearer token
- Basic username / password
- API key (header or query)
- OAuth 2.0 — client credentials
- OAuth 2.0 — authorization code with PKCE
- OAuth 2.0 — refresh token flow

> Set Bearer once on the collection (explorer → collection menu → Edit settings). Requests left on Inherit pick it up.

### Response panel

Inspect status, timing, size, headers, and body.

- JSON pretty-print for application/json bodies
- Preview for images, PDF, Excel (.xlsx), and CSV
- Download response body to disk
- Headers and timing metadata beside the body

### WebSocket

Connect to ws:// or wss:// endpoints from the request bar.

- Switch protocol to WebSocket
- Connect / Disconnect controls replace Send while connected
- Headers and query from the request are applied on connect

## Scripting

### Pre-request scripts

Run JavaScript before Send to set variables for chaining.

- pulse.environment.set("key", value) — write into the active environment
- pulse.variables.set("key", value) — same as environment.set
- Scripts run on single Send and during collection runs when present
- Use Templates / snippets on the Pre-request tab to get started

> Set a token in request A, then use {{token}} in request B of the same collection run.

### Tests

Assert on the last response with pulse.test scripts.

- pulse.test("name", function () { ... })
- pulse.response.to.have.status(200) · to.be.ok · clientError · serverError
- pulse.response.to.have.header("Content-Type")
- pulse.expect(value).to.eql / include / be.above / match / have.property
- pm.test / pm.expect syntax is auto-normalized to pulse.*
- Run tests from the Tests tab or after Send when scripts are attached

### Console

Bottom console for logs and quick pulse evaluations.

- Toggle from the status bar
- help — list commands
- status · text() · json() · headers · time · size
- Run pulse.test / pulse.expect against the last response

## Data

### Collections

Organize saved requests and run them as a set.

- Save, duplicate, delete requests and folders
- Auth, variables, pre-request, and tests on a collection or folder — requests Inherit them
- Import / export Pulse JSON
- Import Postman, Bruno, Insomnia, and OpenAPI (including collection/folder auth and variables)
- Collection runner — sequential Send with pre-request scripts and tests
- Export menus for sharing collections

### Environments

Layered variables: globals, collection, folder, then environment.

- Create and switch environments from the Environments view or status bar
- Globals, collection, and folder variables — environment wins on name clash
- Secret values masked with bullets; initial vs current with Reset
- {{name}} substitution in URL, params, headers, auth, and body
- Variables can be updated at runtime via pre-request scripts

### History

Past sends stored in SQLite with search.

- Paginated history in the explorer and Overview
- Fuzzy search across method, URL, and name
- Reload a past request into a tab
- Clear history from Settings when needed

### Cookie jar

Inspect and edit cookies used by the HTTP engine.

- Settings → Cookie jar — list, add, edit, delete
- Clear entire jar
- Cookies persist with the desktop HTTP engine (reqwest)

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
- Cmd/Ctrl + Enter — Send
- Cmd/Ctrl + T — new request tab
- Cmd/Ctrl + W — close tab
- Cmd/Ctrl + L — focus URL
- Cmd/Ctrl + F — search explorer or Overview
- Cmd/Ctrl + B — toggle explorer
- Cmd/Ctrl + Shift + N — new window
- Cmd/Ctrl + Shift + O — overview window

### Data & privacy

Workspace data is local to your account on this device.

- SQLite per user: workspace, history, HTTP cache
- Settings — export collections, reset database, clear cache
- Sign in keeps a separate auth database from workspace data
