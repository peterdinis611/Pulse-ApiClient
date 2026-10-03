"""GraphQL body + schema helpers (Rust via pulse_native when available)."""

from __future__ import annotations

import json
from typing import Any

_INTROSPECTION_QUERY_PY = """query PulseIntrospection {
  __schema {
    queryType { name }
    mutationType { name }
    subscriptionType { name }
    types {
      kind
      name
      description
      fields {
        name
        description
        args { name }
        type { kind name ofType { kind name ofType { kind name ofType { kind name } } } }
      }
    }
  }
}"""


def _introspection_query() -> str:
    try:
        import pulse_native

        if hasattr(pulse_native, "graphql_introspection_query"):
            return pulse_native.graphql_introspection_query()
    except ImportError:
        pass
    return _INTROSPECTION_QUERY_PY


# Keep a module-level constant for callers (`from pulse.graphql import INTROSPECTION_QUERY`).
INTROSPECTION_QUERY = _introspection_query()


def build_body(query: str, variables: object = None, operation_name: str | None = None) -> str:
    variables_json = _variables_to_json(variables)
    try:
        import pulse_native

        if hasattr(pulse_native, "graphql_build_body_json"):
            return pulse_native.graphql_build_body_json(query, variables_json, operation_name)
    except ImportError:
        pass
    except Exception as error:  # noqa: BLE001 — surface native validation as ValueError
        raise ValueError(str(error)) from error
    return _build_body_py(query, variables, operation_name)


def validate(query: str, variables: object = None, operation_name: str | None = None) -> str | None:
    variables_json = _variables_to_json(variables)
    try:
        import pulse_native

        if hasattr(pulse_native, "graphql_validate_json"):
            report = json.loads(
                pulse_native.graphql_validate_json(query, variables_json, operation_name)
            )
            if report.get("ok"):
                return None
            return report.get("error") or "Invalid GraphQL request."
    except ImportError:
        pass
    try:
        build_body(query, variables, operation_name)
        return None
    except ValueError as error:
        return str(error)


def format_response(body: str) -> str:
    try:
        import pulse_native

        if hasattr(pulse_native, "graphql_format_response_json"):
            return pulse_native.graphql_format_response_json(body)
    except ImportError:
        pass
    return _format_response_py(body)


def summarize_schema(body: str | dict) -> dict[str, Any] | None:
    raw = body if isinstance(body, str) else json.dumps(body)
    try:
        import pulse_native

        if hasattr(pulse_native, "graphql_summarize_schema_json"):
            return json.loads(pulse_native.graphql_summarize_schema_json(raw))
    except ImportError:
        pass
    except Exception:
        pass
    return _summarize_schema_py(body)


def list_operations(document: str) -> list[dict[str, Any]]:
    try:
        import pulse_native

        if hasattr(pulse_native, "graphql_list_operations_json"):
            return json.loads(pulse_native.graphql_list_operations_json(document))
    except ImportError:
        pass
    return _list_operations_py(document)


def _variables_to_json(variables: object) -> str:
    if variables is None or variables == "":
        return "{}"
    if isinstance(variables, str):
        return variables if variables.strip() else "{}"
    return json.dumps(variables)


def _build_body_py(query: str, variables: object = None, operation_name: str | None = None) -> str:
    if not str(query).strip():
        raise ValueError("GraphQL query is required.")
    payload: dict[str, Any] = {"query": query.strip()}
    if variables is None or variables == "":
        payload["variables"] = {}
    elif isinstance(variables, str):
        loaded = json.loads(variables) if variables.strip() else {}
        if loaded is not None and not isinstance(loaded, dict):
            raise ValueError("GraphQL variables must be a JSON object")
        payload["variables"] = loaded or {}
    elif isinstance(variables, dict):
        payload["variables"] = variables
    else:
        raise ValueError("GraphQL variables must be a JSON object")
    name = (operation_name or "").strip()
    if name:
        payload["operationName"] = name
    return json.dumps(payload)


def _summarize_schema_py(body: str | dict) -> dict[str, Any] | None:
    parsed = body if isinstance(body, dict) else json.loads(body)
    schema = ((parsed or {}).get("data") or {}).get("__schema")
    if not isinstance(schema, dict):
        if isinstance(parsed, dict) and isinstance(parsed.get("__schema"), dict):
            schema = parsed["__schema"]
        elif isinstance(parsed, dict) and isinstance(parsed.get("types"), list):
            schema = parsed
        else:
            return None
    types = []
    for item in schema.get("types") or []:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "")
        fields = item.get("fields") or []
        if not name or name.startswith("__") or not fields:
            continue
        types.append(
            {
                "kind": item.get("kind"),
                "name": name,
                "fields": [field.get("name") for field in fields if isinstance(field, dict) and field.get("name")],
            }
        )
    types.sort(key=lambda item: item["name"])
    return {
        "queryType": (schema.get("queryType") or {}).get("name"),
        "mutationType": (schema.get("mutationType") or {}).get("name"),
        "subscriptionType": (schema.get("subscriptionType") or {}).get("name"),
        "types": types,
    }


def _format_response_py(body: str) -> str:
    try:
        parsed = json.loads(body)
    except json.JSONDecodeError:
        return body
    if not isinstance(parsed, dict) or ("data" not in parsed and "errors" not in parsed):
        return body
    sections: list[str] = []
    errors = parsed.get("errors") or []
    if errors:
        lines = []
        for error in errors:
            if not isinstance(error, dict):
                continue
            path = error.get("path") or []
            suffix = f" (path: {'.'.join(str(item) for item in path)})" if path else ""
            lines.append(f"- {error.get('message', '')}{suffix}")
        sections.append("Errors:\n" + "\n".join(lines))
    if "data" in parsed:
        sections.append("Data:\n" + json.dumps(parsed.get("data"), indent=2))
    return "\n\n".join(sections) if sections else body


def _list_operations_py(document: str) -> list[dict[str, Any]]:
    import re

    pattern = re.compile(
        r"(?m)(?P<kind>query|mutation|subscription)\b(?:\s+(?P<name>[A-Za-z_][A-Za-z0-9_]*))?"
    )
    out = [
        {"kind": match.group("kind"), "name": match.group("name")}
        for match in pattern.finditer(document)
    ]
    if not out and document.strip().startswith("{"):
        out.append({"kind": "query", "name": None})
    return out
