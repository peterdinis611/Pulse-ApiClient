"""Contract helpers — schema compare + breaking diff (Rust when available)."""

from __future__ import annotations

import json
from typing import Any


def compare_to_schema(body: str | dict, schema: dict) -> dict[str, Any]:
    body_text = body if isinstance(body, str) else json.dumps(body)
    try:
        from pulse.native import load_native

        native = load_native()
        if hasattr(native, "compare_schema_json"):
            return json.loads(native.compare_schema_json(body_text, json.dumps(schema)))
    except SystemExit:
        pass
    from pulse.schema import validate_json

    errors = validate_json(json.loads(body_text) if body_text.strip() else None, schema)
    return {"ok": not errors, "errors": errors}


def breaking_diff(previous: dict | list | str, current: dict | list | str) -> dict[str, Any]:
    prev = previous if isinstance(previous, str) else json.dumps(previous)
    curr = current if isinstance(current, str) else json.dumps(current)
    try:
        from pulse.native import load_native

        native = load_native()
        if hasattr(native, "breaking_diff_json"):
            return json.loads(native.breaking_diff_json(prev, curr))
    except SystemExit:
        pass
    left = json.loads(prev)
    right = json.loads(curr)
    errors: list[str] = []
    _walk("$", left, right, errors)
    return {"ok": not errors, "errors": errors}


def _json_type(value: Any) -> str:
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, int) and not isinstance(value, bool):
        return "integer"
    if isinstance(value, float):
        return "number"
    if isinstance(value, str):
        return "string"
    if isinstance(value, list):
        return "array"
    if isinstance(value, dict):
        return "object"
    return type(value).__name__


def _walk(path: str, previous: Any, current: Any, errors: list[str]) -> None:
    if isinstance(previous, dict) and isinstance(current, dict):
        for key, left_value in previous.items():
            if key not in current:
                errors.append(f"{path}.{key}: removed")
            else:
                _walk(f"{path}.{key}", left_value, current[key], errors)
        return
    if isinstance(previous, list) and isinstance(current, list):
        if previous and current:
            _walk(f"{path}[]", previous[0], current[0], errors)
        return
    if _json_type(previous) != _json_type(current):
        errors.append(f"{path}: type changed from {_json_type(previous)} to {_json_type(current)}")
