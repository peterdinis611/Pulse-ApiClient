# Pulse Python tooling

Satellite tools around the Rust engine. They are **not** shipped inside the Tauri app.

## CLI (PyO3)

On macOS use `python3` — there is no `python` or `pip` command. Maturin also needs a virtualenv:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install maturin
.venv/bin/python -m maturin develop --manifest-path crates/pulse-native/Cargo.toml
.venv/bin/python python/pulse_cli.py interpolate 'https://api.test/{{id}}' --env '{"id":"1"}'
.venv/bin/python python/pulse_cli.py test ./script.js ./response.json
.venv/bin/python python/pulse_cli.py run ./collection-run.json
```

Or from the repo root: `bun run pulse:cli:install` once, then `bun run pulse:cli interpolate 'https://api.test/{{id}}' --env '{"id":"1"}'`.

`collection-run.json` matches the native `CollectionRunInput` shape (`collectionId`, `requests`, `environment`, `globals`, `dataRows`, …).

## OpenAPI → Pulse

```bash
python3 python/tools/openapi_to_pulse.py openapi.yaml out.json
```

YAML needs `python3 -m pip install pyyaml`. Import `out.json` in Pulse.

## Schemathesis

```bash
python3 -m pip install schemathesis pyyaml
python3 python/tools/schemathesis_pulse.py openapi.yaml --base-url https://staging.example.com --pulse-out collection.json
```
