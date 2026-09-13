# Pulse Python tooling

Satellite tools around the Rust engine. They are **not** shipped inside the Tauri app and do not run as a background process.

`bun run tauri dev` prepares the CLI automatically (creates `.venv` and builds `pulse_native` if missing). Skip with `PULSE_SKIP_CLI=1`. Force a rebuild with `bun run pulse:cli:install`.

Pure Python tests (no native module): `bun run pulse:cli:test`.

## CLI (PyO3)

On macOS use `python3` — there is no `python` or `pip` command.

```bash
bun run pulse:cli:install
bun run pulse:cli interpolate '{{baseUrl}}/{{id}}' --env-file python/examples/staging.env --var id=1
bun run pulse:cli test python/examples/script.js python/examples/response.json
bun run pulse:cli run python/examples/pets.json --env-file python/examples/staging.env --data python/examples/users.csv --summary --junit python/examples/.out/junit.xml
bun run pulse:cli bench python/examples/pets.json --env-file python/examples/staging.env --repeat 3 --budget-p95 5000
bun run pulse:cli openapi python/examples/openapi.json --out python/examples/.out/from-openapi.json
bun run pulse:cli har python/examples/capture.har --out python/examples/.out/from-har.json
bun run pulse:cli schema python/examples/body.json python/examples/schema.json
bun run pulse:cli send --method GET --url https://jsonplaceholder.typicode.com/posts/1
```

`pets.json`, `staging.env`, `users.csv` and the rest live in `python/examples/`. Those names in the repo root do not exist.

## MCP (Cursor)

Pulse exposes the same engine as an MCP stdio server. Project config is `.cursor/mcp.json`.

1. `bun run pulse:cli:install` (venv + `pulse_native`)
2. Reload Cursor (**Settings → MCP** or restart)
3. Enable the **pulse** server if Cursor asks

Tools: `pulse_send`, `pulse_run_collection`, `pulse_bench`, `pulse_write_collection`, `pulse_pre_request`, `pulse_interpolate`, `pulse_run_tests`, `pulse_openapi`, `pulse_har`, `pulse_schema`, `pulse_diff`, `pulse_export_openapi`, `pulse_graphql`, `pulse_curl`, `pulse_snippet`, `pulse_last_run`, `pulse_validate_run`, `pulse_help`.

Prompts (Cursor can pick these without knowing tool names): `run_and_explain`, `openapi_to_pulse`, `compare_responses`, `graphql_introspect`, `curl_import`, `export_openapi`, `explain_last_run`, `validate_schema`.

`pulse_run_collection` and `pulse_bench` emit `notifications/progress` (when the client sends `_meta.progressToken`) plus `notifications/pulse/step` with `{ name, status, ms }` after each request.

Resources (Cursor can read these without a path argument):

- `pulse://examples/pets.json` (and other files in `python/examples/`)
- `pulse://last-run` — last collection run (`pulse_last_run` is the same data as a tool)
- `pulse://openapi/{file}` — e.g. `pulse://openapi/openapi.json`
- `pulse://out/{file}` — files written under `python/examples/.out/`

`pulse_openapi` / `pulse_har` / `pulse_export_openapi` write to `python/examples/.out/` and return `{ path, requests }` (or `{ path, paths }` for export). Pass `"inline": true` only if you need the full JSON. `pulse_write_collection` does the same for a collection object already in the conversation.

`pulse_send` accepts GraphQL (`graphqlQuery` / `graphqlVariables`) and HTTP Basic (`basicUsername` / `basicPassword`). `pulse_graphql` with `introspect: true` returns a compact schema summary. `pulse_curl` parses a cURL command; `pulse_diff` compares two JSON bodies.

Smoke the protocol without Cursor:

```bash
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"cli"}}}' '{"jsonrpc":"2.0","method":"notifications/initialized"}' '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | bun run pulse:mcp
```

Windows: point `command` at `.venv/Scripts/python.exe` instead of `.venv/bin/python`.

`run` accepts a Pulse export (workspace or single collection) or a native `CollectionRunInput`. `--data users.csv` turns each row into one iteration.

Manual setup (same as the automatic hook):

```bash
python3 -m venv .venv
.venv/bin/python -m pip install maturin
.venv/bin/python -m maturin develop --manifest-path crates/pulse-native/Cargo.toml
```

## OpenAPI → Pulse

Path params, query, JSON examples, folders from tags, and a status test from the first 2xx response:

```bash
bun run pulse:cli openapi python/examples/openapi.json --out python/examples/.out/pets.json
```

YAML needs `python3 -m pip install pyyaml`. Import `out.json` in Pulse.

## HAR → Pulse

```bash
bun run pulse:cli har python/examples/capture.har --out python/examples/.out/from-har.json
```

## JSON Schema

Subset (`type`, `required`, `properties`, `items`, `enum`, `const`) with no extra packages:

```bash
bun run pulse:cli schema python/examples/body.json python/examples/schema.json
```

## Schemathesis

```bash
python3 -m pip install schemathesis pyyaml
python3 python/tools/schemathesis_pulse.py openapi.yaml --base-url https://staging.example.com --pulse-out collection.json
```
