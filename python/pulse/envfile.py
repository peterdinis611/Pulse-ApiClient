from __future__ import annotations

import csv
import json
from pathlib import Path


def parse_dotenv(text: str) -> dict[str, str]:
    env: dict[str, str] = {}
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        if line.startswith("export "):
            line = line[7:].strip()
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
            value = value[1:-1]
        if key:
            env[key] = value
    return env


def load_env(
    json_env: dict | None = None,
    env_file: Path | None = None,
    pairs: list[str] | None = None,
) -> dict[str, str]:
    merged: dict[str, str] = {}
    if env_file and env_file.is_file():
        suffix = env_file.suffix.lower()
        if suffix in {".json"}:
            loaded = json.loads(env_file.read_text())
            if not isinstance(loaded, dict):
                raise ValueError(f"{env_file} must contain a JSON object")
            merged.update({str(k): str(v) if not isinstance(v, str) else v for k, v in loaded.items()})
        else:
            merged.update(parse_dotenv(env_file.read_text()))
    if json_env:
        merged.update({str(k): v if isinstance(v, str) else json.dumps(v) for k, v in json_env.items()})
    for pair in pairs or []:
        if "=" not in pair:
            raise ValueError(f"Expected key=value, got {pair!r}")
        key, _, value = pair.partition("=")
        merged[key] = value
    return merged


def load_data_rows(path: Path) -> list[dict[str, str]]:
    suffix = path.suffix.lower()
    if suffix == ".json":
        loaded = json.loads(path.read_text())
        if not isinstance(loaded, list):
            raise ValueError(f"{path} must contain a JSON array of objects")
        rows = []
        for item in loaded:
            if not isinstance(item, dict):
                raise ValueError("each data row must be an object")
            rows.append({str(key): "" if value is None else str(value) for key, value in item.items()})
        return rows
    with path.open(newline="") as handle:
        return [{key: value or "" for key, value in row.items() if key} for row in csv.DictReader(handle)]
