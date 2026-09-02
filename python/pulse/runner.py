from __future__ import annotations

import json
from pathlib import Path

from .export import to_run_input
from .native import load_native


def run_payload(payload: dict) -> dict:
    native = load_native()
    return json.loads(native.run_collection_json(json.dumps(payload)))


def run_export(
    source: dict | Path,
    *,
    env: dict[str, str] | None = None,
    collection_id: str | None = None,
    data_rows: list[dict] | None = None,
) -> dict:
    payload = source if isinstance(source, dict) else json.loads(Path(source).read_text())
    return run_payload(
        to_run_input(payload, env=env, collection_id=collection_id, data_rows=data_rows)
    )
