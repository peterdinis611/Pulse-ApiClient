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
