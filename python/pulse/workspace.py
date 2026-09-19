"""Git YAML workspace helpers for the Python MCP satellite."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

MUTATING = {"POST", "PUT", "PATCH", "DELETE"}


def workspace_root() -> Path | None:
    raw = os.environ.get("PULSE_WORKSPACE") or ""
    path = Path(raw).expanduser()
    return path if raw and path.is_dir() else None


def is_mutating_method(method: str) -> bool:
    return method.strip().upper() in MUTATING


def _load_yaml(path: Path) -> dict[str, Any]:
    text = path.read_text()
    try:
        import yaml  # type: ignore
    except ImportError:
        if path.suffix.lower() == ".json":
            loaded = json.loads(text)
            return loaded if isinstance(loaded, dict) else {}
        raise RuntimeError("PyYAML is required to read YAML workspaces: python3 -m pip install pyyaml")
    loaded = yaml.safe_load(text)
    return loaded if isinstance(loaded, dict) else {}


def list_requests(root: Path) -> list[dict[str, Any]]:
    collections = root / "collections"
    out: list[dict[str, Any]] = []
    if not collections.is_dir():
        return out
    for col in sorted(collections.iterdir()):
        if not col.is_dir():
            continue
        for path in col.rglob("*"):
            if not path.is_file():
                continue
            name = path.name
            if not (name.endswith(".pulse.yaml") or name.endswith(".pulse.yml")):
                continue
            rel = path.relative_to(root).as_posix()
            payload = _load_yaml(path)
            out.append(
                {
                    "id": str(payload.get("id") or rel),
                    "name": payload.get("name") or path.stem,
                    "method": payload.get("method") or "GET",
                    "url": payload.get("url") or "",
                    "filePath": rel,
                    "groupName": col.name,
                    "request": payload,
                }
            )
    return out


def read_request(root: Path, request_id: str) -> dict[str, Any] | None:
    for item in list_requests(root):
        if item["id"] == request_id or item["filePath"] == request_id:
            return item
    return None


def write_request(root: Path, saved: dict[str, Any], group_name: str) -> Path:
    try:
        import yaml  # type: ignore
    except ImportError as error:
        raise RuntimeError("PyYAML is required to write YAML workspaces") from error
    slug = "".join(ch.lower() if ch.isalnum() else "-" for ch in group_name).strip("-") or "collection"
    col = root / "collections" / slug
    col.mkdir(parents=True, exist_ok=True)
    name = str(saved.get("name") or saved.get("id") or "request")
    file_slug = "".join(ch.lower() if ch.isalnum() else "-" for ch in name).strip("-") or "request"
    path = col / f"{file_slug}.pulse.yaml"
    path.write_text(yaml.safe_dump(saved, sort_keys=False))
    return path


def write_pending(root: Path, payload: dict[str, Any]) -> Path:
    pending = root / ".pulse" / "pending"
    pending.mkdir(parents=True, exist_ok=True)
    path = pending / "mutation.json"
    path.write_text(json.dumps(payload, indent=2))
    return path


def append_history(root: Path, entry: dict[str, Any]) -> None:
    folder = root / ".pulse"
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / "history.jsonl"
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(entry) + "\n")


def load_dotenv_secrets(root: Path) -> dict[str, str]:
    path = root / ".env"
    if not path.is_file():
        return {}
    out: dict[str, str] = {}
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        if line.startswith("export "):
            line = line[7:].strip()
        key, value = line.split("=", 1)
        value = value.strip().strip("'").strip('"')
        key = key.strip()
        if key:
            namespaced = key if key.startswith("secret.") else f"secret.{key}"
            out[namespaced] = value
            out[key] = value
    return out
