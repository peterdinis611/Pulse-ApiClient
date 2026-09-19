"""MCP resources: pulse://examples/…, pulse://last-run, pulse://openapi/{file}, pulse://out/{file}, pulse://workspace/*."""

from __future__ import annotations

import json
import re
from pathlib import Path

from ._util import write_json

PYTHON_ROOT = Path(__file__).resolve().parent.parent
REPO_ROOT = PYTHON_ROOT.parent
EXAMPLES = PYTHON_ROOT / "examples"
OUT_DIR = EXAMPLES / ".out"
LAST_RUN_PATH = OUT_DIR / "last-run.json"

_LAST_RUN: dict | None = None

EXAMPLE_MIME = {
    ".json": "application/json",
    ".har": "application/json",
    ".yaml": "text/yaml",
    ".yml": "text/yaml",
    ".env": "text/plain",
    ".csv": "text/csv",
    ".xml": "application/xml",
}


def _under_repo(path: Path) -> bool:
    try:
        path.resolve().relative_to(REPO_ROOT.resolve())
        return True
    except ValueError:
        return False


def _file_under(root: Path, relative: str) -> Path | None:
    path = (root / relative).resolve()
    if not path.is_file() or not _under_repo(path):
        return None
    try:
        path.relative_to(root.resolve())
    except ValueError:
        return None
    return path


def save_last_run(result: dict) -> None:
    global _LAST_RUN
    _LAST_RUN = result
    write_json(LAST_RUN_PATH, result)


def load_last_run() -> dict | None:
    if _LAST_RUN is not None:
        return _LAST_RUN
    if LAST_RUN_PATH.is_file():
        loaded = json.loads(LAST_RUN_PATH.read_text())
        return loaded if isinstance(loaded, dict) else None
    return None


def list_resources() -> list[dict]:
    resources = [
        {
            "uri": "pulse://last-run",
            "name": "last-run",
            "description": "Most recent collection run result (summary + steps)",
            "mimeType": "application/json",
        }
    ]
    if EXAMPLES.is_dir():
        for path in sorted(EXAMPLES.iterdir()):
            if not path.is_file() or path.name.startswith("."):
                continue
            suffix = path.suffix.lower()
            if suffix not in EXAMPLE_MIME:
                continue
            resources.append(
                {
                    "uri": f"pulse://examples/{path.name}",
                    "name": path.name,
                    "description": f"Bundled example ({path.name})",
                    "mimeType": EXAMPLE_MIME[suffix],
                }
            )
    if OUT_DIR.is_dir():
        for path in sorted(OUT_DIR.iterdir()):
            if not path.is_file() or path.name.startswith(".") or path.name == "last-run.json":
                continue
            suffix = path.suffix.lower()
            if suffix not in EXAMPLE_MIME:
                continue
            resources.append(
                {
                    "uri": f"pulse://out/{path.name}",
                    "name": path.name,
                    "description": f"Generated file in python/examples/.out/ ({path.name})",
                    "mimeType": EXAMPLE_MIME[suffix],
                }
            )
    try:
        from .workspace import list_environments, list_requests, workspace_root

        root = workspace_root()
    except Exception:
        root = None
    if root is not None:
        resources.extend(
            [
                {
                    "uri": "pulse://workspace/requests",
                    "name": "workspace-requests",
                    "description": "YAML requests in PULSE_WORKSPACE",
                    "mimeType": "application/json",
                },
                {
                    "uri": "pulse://workspace/environments",
                    "name": "workspace-environments",
                    "description": "Environment YAML files in PULSE_WORKSPACE (secret values stripped)",
                    "mimeType": "application/json",
                },
                {
                    "uri": "pulse://workspace/history",
                    "name": "workspace-history",
                    "description": "Agent history.jsonl from PULSE_WORKSPACE/.pulse/",
                    "mimeType": "application/json",
                },
                {
                    "uri": "pulse://workspace/pending",
                    "name": "workspace-pending",
                    "description": "Mutating MCP calls waiting for confirm=true",
                    "mimeType": "application/json",
                },
            ]
        )
        for item in list_requests(root)[:50]:
            resources.append(
                {
                    "uri": f"pulse://workspace/request/{item['id']}",
                    "name": str(item.get("name") or item["id"]),
                    "description": f"{item.get('method') or 'GET'} {item.get('url') or item['id']}",
                    "mimeType": "application/json",
                }
            )
        for env in list_environments(root):
            resources.append(
                {
                    "uri": f"pulse://workspace/environment/{env['id']}",
                    "name": str(env.get("name") or env["id"]),
                    "description": "Workspace environment (values only; secrets stay in .env)",
                    "mimeType": "application/json",
                }
            )
    return resources


def list_resource_templates() -> list[dict]:
    return [
        {
            "uriTemplate": "pulse://openapi/{file}",
            "name": "OpenAPI spec",
            "description": "Read an OpenAPI JSON/YAML file from the repo (examples/ or a relative path).",
            "mimeType": "application/json",
        },
        {
            "uriTemplate": "pulse://out/{file}",
            "name": "Generated output",
            "description": "Read a file written under python/examples/.out/ (OpenAPI export, converted collections).",
            "mimeType": "application/json",
        },
        {
            "uriTemplate": "pulse://workspace/request/{id}",
            "name": "Workspace request",
            "description": "Read one YAML request from PULSE_WORKSPACE by id.",
            "mimeType": "application/json",
        },
        {
            "uriTemplate": "pulse://workspace/environment/{id}",
            "name": "Workspace environment",
            "description": "Read one environment YAML from PULSE_WORKSPACE by id.",
            "mimeType": "application/json",
        },
    ]


def _read_file(path: Path, uri: str) -> dict:
    mime = EXAMPLE_MIME.get(path.suffix.lower(), "text/plain")
    return {
        "contents": [
            {
                "uri": uri,
                "mimeType": mime,
                "text": path.read_text(),
            }
        ]
    }


def resolve_openapi_file(file: str) -> Path | None:
    relative = file.lstrip("/")
    named = _file_under(EXAMPLES, Path(relative).name)
    if named:
        return named
    return _file_under(REPO_ROOT, relative)


def read_resource(uri: str) -> dict | None:
    if uri == "pulse://last-run":
        result = load_last_run()
        if result is None:
            return None
        return {
            "contents": [
                {
                    "uri": uri,
                    "mimeType": "application/json",
                    "text": json.dumps(result, indent=2),
                }
            ]
        }

    prefix = "pulse://examples/"
    if uri.startswith(prefix):
        path = _file_under(EXAMPLES, uri[len(prefix) :])
        if path is None:
            return None
        return _read_file(path, uri)

    openapi_prefix = "pulse://openapi/"
    if uri.startswith(openapi_prefix):
        path = resolve_openapi_file(uri[len(openapi_prefix) :])
        if path is None:
            return None
        return _read_file(path, uri)

    out_prefix = "pulse://out/"
    if uri.startswith(out_prefix):
        path = _file_under(OUT_DIR, uri[len(out_prefix) :])
        if path is None:
            return None
        return _read_file(path, uri)

    workspace_uri = _read_workspace_resource(uri)
    if workspace_uri is not None:
        return workspace_uri

    return None


def _safe_filename(name: str) -> str:
    stem = Path(name).stem or "collection"
    cleaned = re.sub(r"[^A-Za-z0-9._-]", "-", stem).strip(".-") or "collection"
    return f"{cleaned}.json"


def write_out_json(payload: dict, name: str | None = None) -> Path:
    info = payload.get("info") if isinstance(payload.get("info"), dict) else {}
    title = name or (info or {}).get("title") or "output"
    path = OUT_DIR / _safe_filename(str(title))
    write_json(path, payload)
    try:
        return path.relative_to(REPO_ROOT)
    except ValueError:
        return path


def write_collection_file(payload: dict, name: str | None = None) -> Path:
    title = name or (payload.get("collectionGroups") or [{}])[0].get("name") or "collection"
    path = OUT_DIR / _safe_filename(str(title))
    write_json(path, payload)
    try:
        return path.relative_to(REPO_ROOT)
    except ValueError:
        return path


def write_out_text(text: str, name: str, suffix: str) -> Path:
    stem = Path(name).stem or "output"
    cleaned = re.sub(r"[^A-Za-z0-9._-]", "-", stem).strip(".-") or "output"
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUT_DIR / f"{cleaned}{suffix}"
    path.write_text(text)
    try:
        return path.relative_to(REPO_ROOT)
    except ValueError:
        return path


def _json_contents(uri: str, payload: object) -> dict:
    return {
        "contents": [
            {
                "uri": uri,
                "mimeType": "application/json",
                "text": json.dumps(payload, indent=2),
            }
        ]
    }


def _read_workspace_resource(uri: str) -> dict | None:
    if not uri.startswith("pulse://workspace/"):
        return None
    from .workspace import (
        list_environments,
        list_pending,
        list_requests,
        read_history,
        read_request,
        workspace_root,
    )

    root = workspace_root()
    if root is None:
        return None
    if uri == "pulse://workspace/requests":
        return _json_contents(uri, list_requests(root))
    if uri == "pulse://workspace/environments":
        return _json_contents(uri, list_environments(root))
    if uri == "pulse://workspace/history":
        return _json_contents(uri, read_history(root, limit=50))
    if uri == "pulse://workspace/pending":
        return _json_contents(uri, list_pending(root))
    request_prefix = "pulse://workspace/request/"
    if uri.startswith(request_prefix):
        item = read_request(root, uri[len(request_prefix) :])
        if item is None:
            return None
        return _json_contents(uri, item)
    env_prefix = "pulse://workspace/environment/"
    if uri.startswith(env_prefix):
        needle = uri[len(env_prefix) :]
        for env in list_environments(root):
            if env["id"] == needle or env.get("name") == needle:
                return _json_contents(uri, env)
        return None
    return None
