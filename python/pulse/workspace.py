"""Git YAML workspace helpers for the Python MCP satellite."""

from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any

MUTATING = {"POST", "PUT", "PATCH", "DELETE"}
_PLACEHOLDER = re.compile(r"\{\{\s*([^}]+?)\s*\}\}")


def workspace_root() -> Path | None:
    raw = os.environ.get("PULSE_WORKSPACE") or ""
    path = Path(raw).expanduser()
    return path if raw and path.is_dir() else None


def is_mutating_method(method: str) -> bool:
    return method.strip().upper() in MUTATING


def slug(name: str) -> str:
    collapsed = "-".join(
        part for part in "".join(ch.lower() if ch.isalnum() else "-" for ch in name).split("-") if part
    )
    return collapsed or "collection"


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


def _dump_yaml(path: Path, payload: dict[str, Any]) -> None:
    try:
        import yaml  # type: ignore
    except ImportError as error:
        raise RuntimeError("PyYAML is required to write YAML workspaces") from error
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(yaml.safe_dump(payload, sort_keys=False))


def interpolate_text(text: str, variables: dict[str, Any]) -> str:
    if not text or "{{" not in text:
        return text

    def repl(match: re.Match[str]) -> str:
        key = match.group(1).strip()
        if key in variables and variables[key] is not None:
            return str(variables[key])
        return match.group(0)

    return _PLACEHOLDER.sub(repl, text)


def interpolate_value(value: Any, variables: dict[str, Any]) -> Any:
    if isinstance(value, str):
        return interpolate_text(value, variables)
    if isinstance(value, list):
        return [interpolate_value(item, variables) for item in value]
    if isinstance(value, dict):
        return {key: interpolate_value(item, variables) for key, item in value.items()}
    return value


def vars_from_items(items: Any) -> dict[str, str]:
    out: dict[str, str] = {}
    for item in items or []:
        if not isinstance(item, dict) or item.get("enabled") is False:
            continue
        key = str(item.get("key") or "").strip()
        if key:
            out[key] = str(item.get("value") or "")
    return out


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
            folder = path.parent.relative_to(col).as_posix()
            out.append(
                {
                    "id": str(payload.get("id") or rel),
                    "name": payload.get("name") or path.stem,
                    "method": payload.get("method") or "GET",
                    "url": payload.get("url") or "",
                    "filePath": rel,
                    "groupName": col.name,
                    "folder": None if folder == "." else folder,
                    "request": payload,
                }
            )
    return out


def read_request(root: Path, request_id: str) -> dict[str, Any] | None:
    needle = request_id.strip()
    for item in list_requests(root):
        if item["id"] == needle or item["filePath"] == needle or item["name"] == needle:
            return item
    return None


def search_requests(root: Path, query: str) -> list[dict[str, Any]]:
    needle = query.strip().lower()
    if not needle:
        return list_requests(root)
    hits: list[dict[str, Any]] = []
    for item in list_requests(root):
        haystack = " ".join(
            [
                str(item.get("id") or ""),
                str(item.get("name") or ""),
                str(item.get("method") or ""),
                str(item.get("url") or ""),
                str(item.get("filePath") or ""),
                str(item.get("groupName") or ""),
                str(item.get("folder") or ""),
            ]
        ).lower()
        if needle in haystack:
            hits.append(item)
    return hits


def list_environments(root: Path) -> list[dict[str, Any]]:
    env_root = root / "environments"
    out: list[dict[str, Any]] = []
    if not env_root.is_dir():
        return out
    for path in sorted(env_root.iterdir()):
        if not path.is_file():
            continue
        name = path.name
        if name.endswith(".local.yaml") or name.endswith(".local.yml"):
            continue
        if not (name.endswith(".yaml") or name.endswith(".yml")):
            continue
        payload = _load_yaml(path)
        out.append(
            {
                "id": str(payload.get("id") or f"env_{slug(payload.get('name') or path.stem)}"),
                "name": payload.get("name") or path.stem,
                "filePath": path.relative_to(root).as_posix(),
                "variables": payload.get("variables") or [],
            }
        )
    return out


def load_collection_meta(root: Path, group_name: str) -> dict[str, Any]:
    path = root / "collections" / group_name / "collection.yaml"
    if not path.is_file():
        path = root / "collections" / group_name / "collection.yml"
    if not path.is_file():
        return {}
    return _load_yaml(path)


def merge_variables(
    root: Path,
    *,
    group_name: str | None = None,
    env_name: str | None = None,
    extra: dict[str, Any] | None = None,
) -> dict[str, str]:
    merged: dict[str, str] = {}
    if group_name:
        merged.update(vars_from_items(load_collection_meta(root, group_name).get("variables")))
    if env_name:
        for env in list_environments(root):
            if env.get("name") == env_name or env.get("id") == env_name:
                merged.update(vars_from_items(env.get("variables")))
                break
    merged.update(load_dotenv_secrets(root))
    if extra:
        merged.update({str(key): str(value) for key, value in extra.items()})
    return merged


def request_to_http_payload(request: dict[str, Any]) -> dict[str, Any]:
    nested = request.get("request") if isinstance(request.get("request"), dict) else None
    body = nested if nested and (nested.get("method") or nested.get("url")) else request
    headers = body.get("headers") or []
    query = body.get("query") or []
    auth = body.get("auth") if isinstance(body.get("auth"), dict) else {}
    return {
        "method": str(body.get("method") or "GET"),
        "url": str(body.get("url") or ""),
        "headers": headers if isinstance(headers, list) else [],
        "query": query if isinstance(query, list) else [],
        "bodyKind": str(body.get("bodyKind") or "none"),
        "body": str(body.get("body") or ""),
        "form": body.get("form") or [],
        "multipart": body.get("multipart") or [],
        "auth": {
            "authType": auth.get("authType") or "none",
            "bearerToken": auth.get("bearerToken"),
            "basicUsername": auth.get("basicUsername"),
            "basicPassword": auth.get("basicPassword"),
            "apiKeyKey": auth.get("apiKeyKey"),
            "apiKeyValue": auth.get("apiKeyValue"),
            "apiKeyIn": auth.get("apiKeyIn"),
        },
    }


def write_request(root: Path, saved: dict[str, Any], group_name: str) -> Path:
    nested = saved.get("request")
    if isinstance(nested, dict) and (nested.get("method") or nested.get("url") or nested.get("id")):
        payload = dict(nested)
        payload["id"] = saved.get("id") or nested.get("id") or ""
        payload["name"] = saved.get("name") or nested.get("name") or "request"
    else:
        payload = dict(saved)
    group_dir = root / "collections" / slug(group_name)
    folder = saved.get("folder")
    if folder:
        for part in str(folder).split("/"):
            if part.strip():
                group_dir = group_dir / slug(part)
    name = str(payload.get("name") or payload.get("id") or "request")
    path = group_dir / f"{slug(name)}.pulse.yaml"
    _dump_yaml(path, payload)
    return path


def ensure_collection_meta(root: Path, group_name: str, collection_id: str | None = None) -> Path:
    col = root / "collections" / slug(group_name)
    path = col / "collection.yaml"
    if path.is_file():
        return path
    _dump_yaml(
        path,
        {
            "id": collection_id or f"col_{slug(group_name)}",
            "name": group_name,
            "folders": [],
            "variables": [],
        },
    )
    return path


def delete_request(root: Path, request_id: str) -> Path:
    item = read_request(root, request_id)
    if item is None:
        raise FileNotFoundError(f"Request not found: {request_id}")
    path = root / str(item["filePath"])
    if not path.is_file():
        raise FileNotFoundError(f"File not found: {path}")
    path.unlink()
    return path


def import_openapi_requests(
    root: Path,
    collections_payload: dict[str, Any],
    group_name: str | None = None,
) -> dict[str, Any]:
    groups = collections_payload.get("collectionGroups") or []
    title = group_name or (groups[0].get("name") if groups else None) or "imported"
    collection_id = (groups[0].get("id") if groups else None) or f"col_{slug(title)}"
    ensure_collection_meta(root, title, str(collection_id))
    written: list[str] = []
    for saved in collections_payload.get("collections") or []:
        if not isinstance(saved, dict):
            continue
        path = write_request(root, saved, title)
        written.append(path.relative_to(root).as_posix())
    return {"collection": title, "written": written, "count": len(written)}


def workspace_as_payload(root: Path) -> dict[str, Any]:
    pulse = _load_yaml(root / "pulse.yaml") if (root / "pulse.yaml").is_file() else {}
    groups: dict[str, dict[str, Any]] = {}
    collections: list[dict[str, Any]] = []
    for item in list_requests(root):
        group_name = str(item.get("groupName") or "collection")
        meta = load_collection_meta(root, group_name)
        group_id = str(meta.get("id") or f"col_{slug(group_name)}")
        if group_id not in groups:
            folders = list(meta.get("folders") or [])
            groups[group_id] = {
                "id": group_id,
                "name": meta.get("name") or group_name,
                "folders": folders,
                "variables": meta.get("variables") or [],
            }
        folder = item.get("folder")
        if folder and folder not in groups[group_id]["folders"]:
            groups[group_id]["folders"].append(folder)
        collections.append(
            {
                "id": item["id"],
                "name": item["name"],
                "collectionId": group_id,
                "folder": folder,
                "filePath": item["filePath"],
                "request": item["request"],
            }
        )
    return {
        "version": 1,
        "name": pulse.get("name") or root.name,
        "root": str(root),
        "collectionGroups": list(groups.values()),
        "collections": collections,
        "environments": list_environments(root),
    }


def workspace_status(root: Path) -> dict[str, Any]:
    pulse = _load_yaml(root / "pulse.yaml") if (root / "pulse.yaml").is_file() else {}
    secrets = load_dotenv_secrets(root)
    secret_keys = sorted(
        {key[7:] if key.startswith("secret.") else key for key in secrets}
    )
    return {
        "root": str(root),
        "name": pulse.get("name") or root.name,
        "requests": len(list_requests(root)),
        "environments": [item.get("name") for item in list_environments(root)],
        "pending": len(list_pending(root)),
        "history": len(read_history(root, limit=0)),
        "secretKeys": secret_keys,
    }


def check_workspace_files(root: Path) -> dict[str, Any]:
    errors: list[str] = []
    if not (root / "pulse.yaml").is_file() and not (root / "collections").is_dir():
        errors.append("missing pulse.yaml and collections/")
    for item in list_requests(root):
        rel = item["filePath"]
        request = item.get("request") or {}
        if not request.get("url"):
            errors.append(f"{rel}: missing url")
        method = str(request.get("method") or "GET").upper()
        if method not in {"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"}:
            errors.append(f"{rel}: invalid method {method}")
        schema = request.get("responseSchema")
        if isinstance(schema, str) and schema.strip():
            try:
                json.loads(schema)
            except json.JSONDecodeError:
                errors.append(f"{rel}: responseSchema is not JSON")
        file_name = Path(rel).name
        prev_name = file_name.replace(".pulse.yaml", ".previous.json").replace(".pulse.yml", ".previous.json")
        previous = (root / rel).with_name(prev_name)
        if previous.is_file():
            try:
                json.loads(previous.read_text())
            except json.JSONDecodeError:
                errors.append(f"{previous.relative_to(root).as_posix()}: invalid JSON snapshot")
    return {"ok": not errors, "errors": errors}


def write_pending(root: Path, payload: dict[str, Any]) -> Path:
    pending = root / ".pulse" / "pending"
    pending.mkdir(parents=True, exist_ok=True)
    ident = str(payload.get("id") or payload.get("method") or "mutation")
    path = pending / f"{slug(ident)}.json"
    path.write_text(json.dumps(payload, indent=2))
    return path


def list_pending(root: Path) -> list[dict[str, Any]]:
    pending = root / ".pulse" / "pending"
    if not pending.is_dir():
        return []
    out: list[dict[str, Any]] = []
    for path in sorted(pending.glob("*.json")):
        try:
            body = json.loads(path.read_text())
        except json.JSONDecodeError:
            body = {"raw": path.read_text()}
        out.append({"file": path.name, "path": path.relative_to(root).as_posix(), "payload": body})
    return out


def append_history(root: Path, entry: dict[str, Any]) -> None:
    folder = root / ".pulse"
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / "history.jsonl"
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(entry) + "\n")


def read_history(root: Path, limit: int = 20) -> list[dict[str, Any]]:
    path = root / ".pulse" / "history.jsonl"
    if not path.is_file():
        return []
    entries: list[dict[str, Any]] = []
    for line in path.read_text().splitlines():
        if not line.strip():
            continue
        try:
            loaded = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(loaded, dict):
            entries.append(loaded)
    if limit and limit > 0:
        return entries[-limit:]
    return entries


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
        value = value.strip().strip("'").strip('"")
        key = key.strip()
        if key:
            namespaced = key if key.startswith("secret.") else f"secret.{key}"
            out[namespaced] = value
            out[key] = value
    return out
