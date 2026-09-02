# Pulse Python tooling

Satellite tools around the Rust engine. They are **not** shipped inside the Tauri app and do not run as a background process.

`bun run tauri dev` prepares the CLI automatically (creates `.venv` and builds `pulse_native` if missing). Skip with `PULSE_SKIP_CLI=1`. Force a rebuild with `bun run pulse:cli:install`.

## CLI (PyO3)

On macOS use `python3` — there is no `python` or `pip` command.

```bash
bun run tauri dev
bun run pulse:cli interpolate 'https://api.test/{{id}}' --env '{"id":"1"}'
bun run pulse:cli test ./script.js ./response.json
bun run pulse:cli run ./collection-run.json
```

Manual setup (same as the automatic hook):

```bash
python3 -m venv .venv
.venv/bin/python -m pip install maturin
.venv/bin/python -m maturin develop --manifest-path crates/pulse-native/Cargo.toml
```

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
