#!/usr/bin/env python3
"""Convert an OpenAPI 3 JSON/YAML spec into a Pulse collection export."""

from __future__ import annotations

import json
import sys
import uuid
from pathlib import Path


def load_spec(path: Path) -> dict:
    text = path.read_text()
    if path.suffix.lower() in {".yaml", ".yml"}:
        try:
            import yaml  # type: ignore
        except ImportError as error:
            raise SystemExit("PyYAML is required for YAML specs: pip install pyyaml") from error
        return yaml.safe_load(text)
    return json.loads(text)


def kv(key: str, value: str = "") -> dict:
    return {
        "id": f"kv_{uuid.uuid4().hex[:10]}",
        "key": key,
        "value": value,
        "enabled": True,
    }


def method_from(name: str) -> str | None:
    upper = name.upper()
    if upper in {"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"}:
        return upper
    return None


def convert(spec: dict) -> dict:
    title = (spec.get("info") or {}).get("title") or "OpenAPI Collection"
    servers = spec.get("servers") or []
    base = (servers[0].get("url") if servers else "") or ""
    base = base.rstrip("/")
    collection_id = f"col_{uuid.uuid4().hex[:10]}"
    collection = {
        "id": collection_id,
        "name": title,
        "source": "pulse",
        "folders": [],
    }
    requests = []
    for path, operations in (spec.get("paths") or {}).items():
        if not isinstance(operations, dict):
            continue
        for verb, operation in operations.items():
            method = method_from(verb)
            if not method or not isinstance(operation, dict):
                continue
            name = operation.get("summary") or operation.get("operationId") or f"{method} {path}"
            url = f"{base}{path}"
            request = {
                "id": f"req_{uuid.uuid4().hex[:10]}",
                "name": name,
                "protocol": "http",
                "method": method,
                "url": url,
                "headers": [kv("Accept", "application/json")],
                "query": [],
                "pathParams": [],
                "bodyKind": "none",
                "body": "",
                "form": [],
                "multipart": [],
                "auth": {"authType": "inherit"},
                "tests": "",
                "preRequestScript": "",
            }
            requests.append(
                {
                    "id": f"saved_{uuid.uuid4().hex[:10]}",
                    "name": name,
                    "collectionId": collection_id,
                    "request": request,
                }
            )
    return {
        "version": 1,
        "collectionGroups": [collection],
        "collections": requests,
    }


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: openapi_to_pulse.py <openapi.json|yaml> [out.json]", file=sys.stderr)
        return 2
    source = Path(sys.argv[1])
    payload = convert(load_spec(source))
    rendered = json.dumps(payload, indent=2)
    if len(sys.argv) > 2:
        Path(sys.argv[2]).write_text(rendered + "\n")
    else:
        print(rendered)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
