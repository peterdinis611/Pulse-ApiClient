"""Minimal JSON Schema checks (type / required / properties / items) — no extra deps."""

from __future__ import annotations


def validate_json(instance: object, schema: dict, path: str = "$") -> list[str]:
    errors: list[str] = []
    expected = schema.get("type")
    if expected:
        if not _matches_type(instance, expected):
            errors.append(f"{path}: expected {expected}, got {_type_name(instance)}")
            return errors
    if isinstance(instance, dict):
        required = schema.get("required") or []
        for key in required:
            if key not in instance:
                errors.append(f"{path}: missing required property {key!r}")
        properties = schema.get("properties") or {}
        for key, child in properties.items():
            if key in instance:
                errors.extend(validate_json(instance[key], child, f"{path}.{key}"))
        additional = schema.get("additionalProperties")
        if additional is False:
            extras = [key for key in instance if key not in properties]
            if extras:
                errors.append(f"{path}: unexpected properties {extras}")
    if isinstance(instance, list) and "items" in schema:
        item_schema = schema["items"]
        for index, item in enumerate(instance):
            errors.extend(validate_json(item, item_schema, f"{path}[{index}]"))
        min_items = schema.get("minItems")
        if min_items is not None and len(instance) < min_items:
            errors.append(f"{path}: expected at least {min_items} items")
        max_items = schema.get("maxItems")
        if max_items is not None and len(instance) > max_items:
            errors.append(f"{path}: expected at most {max_items} items")
    const = schema.get("const")
    if "const" in schema and instance != const:
        errors.append(f"{path}: expected {const!r}")
    enum = schema.get("enum")
    if enum is not None and instance not in enum:
        errors.append(f"{path}: expected one of {enum}")
    return errors


def _type_name(value: object) -> str:
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


def _matches_type(value: object, expected: str | list) -> bool:
    names = expected if isinstance(expected, list) else [expected]
    actual = _type_name(value)
    for name in names:
        if name == "number" and actual in {"number", "integer"}:
            return True
        if name == actual:
            return True
        if name == "integer" and actual == "integer":
            return True
    return False
