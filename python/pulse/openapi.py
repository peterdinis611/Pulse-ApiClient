from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from ._util import kv, uid, write_json

PATH_PARAM = re.compile(r"\{([^}]+)\}")


def load_spec(path: Path) -> dict:
    text = path.read_text()
    if path.suffix.lower() in {".yaml", ".yml"}:
        try:
            import yaml  # type: ignore
        except ImportError as error:
            raise SystemExit("PyYAML is required for YAML specs: python3 -m pip install pyyaml") from error
        return yaml.safe_load(text)
    return json.loads(text)


def _example_from_schema(schema: dict | None) -> str:
    if not schema:
        return ""
    if "example" in schema:
        value = schema["example"]
        return value if isinstance(value, str) else json.dumps(value)
    if schema.get("type") == "integer":
        return "1"
    if schema.get("type") == "boolean":
        return "true"
    if schema.get("enum"):
        first = schema["enum"][0]
        return first if isinstance(first, str) else json.dumps(first)
    return schema.get("default") if isinstance(schema.get("default"), str) else ""


def _json_example(content: dict | None) -> str:
    if not content:
        return ""
    json_body = content.get("application/json") or next(iter(content.values()), None) or {}
    if "example" in json_body:
        example = json_body["example"]
        return example if isinstance(example, str) else json.dumps(example, indent=2)
    examples = json_body.get("examples") or {}
    if examples:
        first = next(iter(examples.values()))
        value = first.get("value") if isinstance(first, dict) else first
        return value if isinstance(value, str) else json.dumps(value, indent=2)
    schema = json_body.get("schema") or {}
    if "example" in schema:
        example = schema["example"]
        return example if isinstance(example, str) else json.dumps(example, indent=2)
    return ""


def _status_test(responses: dict) -> str:
    codes = []
    for key in responses or {}:
        if str(key).isdigit() and 200 <= int(key) < 300:
            codes.append(int(key))
    if not codes:
        return ""
    expected = min(codes)
    return (
        "pulse.test(\"status\", function () {\n"
        f"    pulse.response.to.have.status({expected});\n"
        "});\n"
    )


def convert(spec: dict) -> dict:
    title = (spec.get("info") or {}).get("title") or "OpenAPI Collection"
    servers = spec.get("servers") or []
    base = ((servers[0].get("url") if servers else "") or "").rstrip("/")
    collection_id = uid("col")
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
        shared_params = operations.get("parameters") if isinstance(operations.get("parameters"), list) else []
        for verb, operation in operations.items():
            method = verb.upper()
            if method not in {"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"} or not isinstance(
                operation, dict
            ):
                continue
            name = operation.get("summary") or operation.get("operationId") or f"{method} {path}"
            params = list(shared_params) + (operation.get("parameters") or [])
            query = []
            headers = [kv("Accept", "application/json")]
            path_params = []
            seen_path = set()
            for param in params:
                if not isinstance(param, dict):
                    continue
                location = param.get("in")
                key = param.get("name") or ""
                example = param.get("example")
                if example is None:
                    example = _example_from_schema(param.get("schema") or {})
                value = "" if example is None else str(example)
                if location == "query" and key:
                    query.append(kv(key, value))
                elif location == "header" and key and key.lower() != "accept":
                    headers.append(kv(key, value))
                elif location == "path" and key:
                    path_params.append(kv(key, value or "1"))
                    seen_path.add(key)
            for match in PATH_PARAM.findall(path):
                if match not in seen_path:
                    path_params.append(kv(match, "1"))
                    seen_path.add(match)
            body = _json_example((operation.get("requestBody") or {}).get("content"))
            body_kind = "json" if body else "none"
            tags = operation.get("tags") or []
            folder = tags[0] if tags else None
            if folder and folder not in collection["folders"]:
                collection["folders"].append(folder)
            request = {
                "id": uid("req"),
                "name": name,
                "protocol": "http",
                "method": method,
                "url": f"{base}{path}",
                "headers": headers,
                "query": query,
                "pathParams": path_params,
                "bodyKind": body_kind,
                "body": body,
                "form": [],
                "multipart": [],
                "auth": {"authType": "inherit"},
                "tests": _status_test(operation.get("responses") or {}),
                "preRequestScript": "",
            }
            requests.append(
                {
                    "id": uid("saved"),
                    "name": name,
                    "collectionId": collection_id,
                    "folder": folder,
                    "request": request,
                }
            )
    return {"version": 1, "collectionGroups": [collection], "collections": requests}


def main(argv: list[str] | None = None) -> int:
    args = argv if argv is not None else sys.argv[1:]
    if not args:
        print("Usage: openapi_to_pulse.py <openapi.json|yaml> [out.json]", file=sys.stderr)
        return 2
    source = Path(args[0])
    payload = convert(load_spec(source))
    if len(args) > 1:
        write_json(Path(args[1]), payload)
    else:
        print(json.dumps(payload, indent=2))
    return 0
