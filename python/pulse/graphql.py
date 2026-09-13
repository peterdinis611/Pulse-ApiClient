"""GraphQL body + a compact introspection query (same shape as the desktop explorer)."""

from __future__ import annotations

import json
from typing import Any

INTROSPECTION_QUERY = """query PulseIntrospection {
  __schema {
    queryType { name }
    mutationType { name }
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


def build_body(query: str, variables: object = None, operation_name: str | None = None) -> str:
    payload: dict[str, Any] = {"query": query}
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


def summarize_schema(body: str | dict) -> dict[str, Any] | None:
    parsed = body if isinstance(body, dict) else json.loads(body)
    schema = ((parsed or {}).get("data") or {}).get("__schema")
    if not isinstance(schema, dict):
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
    return {
        "queryType": (schema.get("queryType") or {}).get("name"),
        "mutationType": (schema.get("mutationType") or {}).get("name"),
        "types": types,
    }
