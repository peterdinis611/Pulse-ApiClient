from __future__ import annotations

import json
import uuid
from pathlib import Path


def uid(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:10]}"


def kv(key: str, value: str = "", enabled: bool = True) -> dict:
    return {"id": uid("kv"), "key": key, "value": value, "enabled": enabled}


def load_json(path: Path) -> object:
    return json.loads(path.read_text())


def write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n")
