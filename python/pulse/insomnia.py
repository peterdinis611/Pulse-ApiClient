"""Insomnia export v4 import and export."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from ._util import kv, uid
from .collections_io import (
    create_request,
    create_saved_request,
    default_auth,
    default_graphql_query,
    default_graphql_variables,
    empty_kv,
    parse_method,
    pulse_dump,
)

_REQUEST_TYPES = {"request", "request_group"}
_QUERY_PLACEMENTS = {"queryparams", "query"}


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #

def _as_string(value: object) -> str:
    return "" if value is None else str(value)


def _as_dict(value: object) -> dict:
    return value if isinstance(value, dict) else {}


def _lower(value: object) -> str:
    return value.lower().strip() if isinstance(value, str) else ""


def _sort_key(resource: dict) -> float:
    """Insomnia orders siblings by ``metaSortKey`` (ascending)."""
    value = resource.get("metaSortKey")
    return float(value) if isinstance(value, (int, float)) and not isinstance(value, bool) else 0.0


def _folder_name(raw: object) -> str:
    # "/" is the path separator, so it must not appear inside a folder name.
    return _as_string(raw).strip().replace("/", "-") or "Folder"


# --------------------------------------------------------------------------- #
# Import
# --------------------------------------------------------------------------- #

def _parse_kv(items: list[dict] | None) -> list[dict]:
    """Insomnia rows use ``name``/``value``/``disabled`` (not ``enabled``)."""
    rows = [
        kv(_as_string(item.get("name")), _as_string(item.get("value")), not item.get("disabled"))
        for item in items or []
        if isinstance(item, dict)
    ]
    return rows or [empty_kv()]


def _parse_auth(auth: dict | None) -> dict:
    base = default_auth()
    auth = _as_dict(auth)
    auth_type = _lower(auth.get("type"))
    if auth.get("disabled") or not auth_type or auth_type == "none":
        return base

    if auth_type == "bearer":
        return {**base, "authType": "bearer", "bearerToken": auth.get("token") or ""}

    if auth_type == "basic":
        return {
            **base,
            "authType": "basic",
            "basicUsername": auth.get("username") or "",
            "basicPassword": auth.get("password") or "",
        }

    if auth_type == "apikey":
        return {
            **base,
            "authType": "apiKey",
            "apiKeyKey": auth.get("key") or "",
            "apiKeyValue": auth.get("value") or "",
            # Insomnia writes "queryParams"; compare case-insensitively.
            "apiKeyIn": "query" if _lower(auth.get("addTo")) in _QUERY_PLACEMENTS else "header",
        }

    return base  # oauth2, digest, ntlm, ... are not supported


def _body_fields(**overrides: Any) -> dict:
    fields: dict[str, Any] = {
        "bodyKind": "none",
        "body": "",
        "form": [empty_kv()],
        "multipart": [],
        "graphqlQuery": default_graphql_query(),
        "graphqlVariables": default_graphql_variables(),
    }
    fields.update(overrides)
    return fields


def _parse_graphql_body(text: str) -> dict:
    try:
        parsed = json.loads(text or "{}")
    except json.JSONDecodeError:
        parsed = None

    if not isinstance(parsed, dict):
        # Not the usual {"query", "variables"} envelope: treat text as the query itself.
        return _body_fields(bodyKind="graphql", graphqlQuery=text or default_graphql_query())

    variables = parsed.get("variables")
    if not isinstance(variables, str):
        variables = json.dumps(variables if variables is not None else {}, indent=2)
    return _body_fields(
        bodyKind="graphql",
        graphqlQuery=parsed.get("query") or default_graphql_query(),
        graphqlVariables=variables,
    )


def _parse_multipart(params: list[dict] | None) -> list[dict]:
    fields = []
    for item in params or []:
        if not isinstance(item, dict):
            continue
        is_file = item.get("type") == "file" or bool(item.get("fileName"))
        field = {
            "id": uid("mp"),
            "key": _as_string(item.get("name")),
            "value": _as_string(item.get("value")),
            "enabled": not item.get("disabled"),
            "fieldType": "file" if is_file else "text",
        }
        if item.get("fileName"):
            field["fileName"] = item["fileName"]
        fields.append(field)
    return fields


def _parse_body(body: dict | None) -> dict:
    body = _as_dict(body)
    mime = _lower(body.get("mimeType"))
    text = body.get("text") if isinstance(body.get("text"), str) else ""
    params = body.get("params")

    if (not mime or mime == "application/octet-stream") and not text.strip() and not params:
        return _body_fields()

    if "graphql" in mime:
        return _parse_graphql_body(text)
    if "json" in mime:
        return _body_fields(bodyKind="json", body=text)
    if "x-www-form-urlencoded" in mime:
        return _body_fields(bodyKind="form", form=_parse_kv(params))
    if "multipart" in mime:
        return _body_fields(bodyKind="multipart", multipart=_parse_multipart(params))
    return _body_fields(bodyKind="raw", body=text)


def _build_folder_path(
    resource_id: str,
    by_id: dict[str, dict],
    cache: dict[str, str],
    _seen: set[str] | None = None,
) -> str:
    if resource_id in cache:
        return cache[resource_id]

    seen = _seen if _seen is not None else set()
    resource = by_id.get(resource_id)
    # The `seen` guard protects against cyclic parentId chains in damaged exports.
    if not resource or resource.get("_type") != "request_group" or resource_id in seen:
        cache[resource_id] = ""
        return ""

    seen.add(resource_id)
    parent_id = resource.get("parentId")
    parent_path = _build_folder_path(parent_id, by_id, cache, seen) if parent_id else ""
    name = _folder_name(resource.get("name"))
    path = f"{parent_path}/{name}" if parent_path else name
    cache[resource_id] = path
    return path


def _workspace_name(resources: list[dict]) -> str:
    # Prefer a real workspace over a project wrapper.
    for wanted in ("workspace", "project"):
        for item in resources:
            if isinstance(item, dict) and item.get("_type") == wanted:
                name = _as_string(item.get("name")).strip()
                if name:
                    return name
    return "Insomnia Collection"


def is_insomnia_export(raw: str) -> bool:
    try:
        parsed = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return False

    if not isinstance(parsed, dict):
        return False
    resources = parsed.get("resources")
    if not isinstance(resources, list):
        return False
    if parsed.get("_type") == "export" or isinstance(parsed.get("__export_format"), int):
        return True
    return any(isinstance(item, dict) and item.get("_type") in _REQUEST_TYPES for item in resources)


def import_insomnia(raw: str) -> dict:
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid Insomnia JSON: {exc.msg} (line {exc.lineno}).") from exc

    resources = parsed.get("resources") if isinstance(parsed, dict) else None
    if not isinstance(resources, list) or not resources:
        raise ValueError("Insomnia export has no resources.")

    dict_resources = [item for item in resources if isinstance(item, dict)]
    by_id = {item["_id"]: item for item in dict_resources if item.get("_id")}
    folder_cache: dict[str, str] = {}
    folder_paths: set[str] = set()
    collection_id = uid("col")
    requests: list[dict] = []

    # Stable sort keeps file order for requests without metaSortKey.
    ordered = sorted((r for r in dict_resources if r.get("_type") == "request"), key=_sort_key)

    for resource in ordered:
        parent_id = resource.get("parentId")
        folder = _build_folder_path(parent_id, by_id, folder_cache) if parent_id else ""
        if folder:
            parts = folder.split("/")
            folder_paths.update("/".join(parts[:i]) for i in range(1, len(parts) + 1))

        request = create_request(
            {
                "name": _as_string(resource.get("name")).strip() or "Untitled Request",
                "method": parse_method(resource.get("method")),
                "url": _as_string(resource.get("url")).strip(),
                "headers": _parse_kv(resource.get("headers")),
                "query": _parse_kv(resource.get("parameters")),
                "auth": _parse_auth(resource.get("authentication")),
                **_parse_body(resource.get("body")),
            }
        )
        requests.append(
            create_saved_request(
                request,
                collection_id=collection_id,
                folder=folder or None,
                name=request["name"],
            )
        )

    if not requests:
        raise ValueError("No valid requests found in Insomnia export.")

    collection: dict[str, Any] = {
        "id": collection_id,
        "name": _workspace_name(dict_resources),
        "source": "insomnia",
        "folders": sorted(folder_paths),
    }
    return pulse_dump(collection, requests)


# --------------------------------------------------------------------------- #
# Export
# --------------------------------------------------------------------------- #

def _to_insomnia_key_values(items: list[dict] | None) -> list[dict]:
    rows = []
    for item in items or []:
        key = _as_string(item.get("key"))
        value = _as_string(item.get("value"))
        if not key.strip() and not value.strip():
            continue
        row: dict[str, Any] = {"name": key, "value": value}
        if item.get("enabled") is False:
            row["disabled"] = True
        rows.append(row)
    return rows


def _to_insomnia_auth(auth: dict | None) -> dict:
    auth = _as_dict(auth)
    auth_type = auth.get("authType")

    if auth_type == "bearer":
        return {"type": "bearer", "token": auth.get("bearerToken") or ""}
    if auth_type == "basic":
        return {
            "type": "basic",
            "username": auth.get("basicUsername") or "",
            "password": auth.get("basicPassword") or "",
        }
    if auth_type == "apiKey":
        return {
            "type": "apikey",
            "key": auth.get("apiKeyKey") or "",
            "value": auth.get("apiKeyValue") or "",
            "addTo": "queryParams" if auth.get("apiKeyIn") == "query" else "header",
        }
    return {}  # Insomnia represents "no auth" as an empty object


def _to_insomnia_multipart(fields: list[dict] | None) -> list[dict]:
    params = []
    for field in fields or []:
        key = _as_string(field.get("key"))
        is_file = field.get("fieldType") == "file"
        file_name = _as_string(field.get("fileName"))
        value = "" if is_file else _as_string(field.get("value"))
        if not (key.strip() or value.strip() or file_name):
            continue
        param: dict[str, Any] = {"name": key, "value": value}
        if field.get("enabled") is False:
            param["disabled"] = True
        if is_file:
            param.update({"type": "file", "fileName": file_name})
        params.append(param)
    return params


def _to_insomnia_body(request: dict) -> dict:
    body_kind = request.get("bodyKind") or "none"

    if body_kind == "json":
        return {"mimeType": "application/json", "text": request.get("body") or ""}

    if body_kind == "graphql":
        try:
            variables = json.loads(request.get("graphqlVariables") or "{}")
        except json.JSONDecodeError:
            variables = {}
        if not isinstance(variables, dict):
            variables = {}
        return {
            "mimeType": "application/graphql",
            "text": json.dumps(
                {"query": request.get("graphqlQuery") or "", "variables": variables},
                ensure_ascii=False,
            ),
        }

    if body_kind == "form":
        return {
            "mimeType": "application/x-www-form-urlencoded",
            "params": _to_insomnia_key_values(request.get("form")),
        }

    if body_kind == "multipart":
        return {
            "mimeType": "multipart/form-data",
            "params": _to_insomnia_multipart(request.get("multipart")),
        }

    if body_kind == "raw":
        return {"mimeType": "text/plain", "text": request.get("body") or ""}

    return {}


def _ensure_folder_ids(
    folder_path: str,
    workspace_id: str,
    folder_ids: dict[str, str],
    resources: list[dict],
    sort_keys: dict[str, int],
) -> str:
    folder_path = folder_path.strip("/ ")
    if not folder_path:
        return workspace_id
    if folder_path in folder_ids:
        return folder_ids[folder_path]

    parts = folder_path.split("/")
    parent_id = _ensure_folder_ids("/".join(parts[:-1]), workspace_id, folder_ids, resources, sort_keys)
    folder_id = uid("fld")
    folder_ids[folder_path] = folder_id
    sort_keys["next"] += 1
    resources.append(
        {
            "_id": folder_id,
            "_type": "request_group",
            "parentId": parent_id,
            "name": parts[-1] or "Folder",
            "metaSortKey": sort_keys["next"],
        }
    )
    return folder_id


def export_insomnia(group: dict, requests: list[dict]) -> str:
    workspace_id = uid("wrk")
    resources: list[dict] = [
        {
            "_id": workspace_id,
            "_type": "workspace",
            "parentId": None,
            "name": group.get("name") or "Collection",
            "scope": "collection",
        }
    ]
    folder_ids: dict[str, str] = {}
    sort_keys = {"next": 0}  # one counter keeps folders and requests in input order

    for path in group.get("folders") or []:
        _ensure_folder_ids(path, workspace_id, folder_ids, resources, sort_keys)

    for saved in requests:
        request = saved.get("request") or {}
        parent_id = _ensure_folder_ids(
            _as_string(saved.get("folder")), workspace_id, folder_ids, resources, sort_keys
        )
        is_graphql = request.get("bodyKind") == "graphql"
        sort_keys["next"] += 1
        resources.append(
            {
                "_id": uid("req"),
                "_type": "request",
                "parentId": parent_id,
                "name": saved.get("name") or request.get("name") or "Request",
                "method": "POST" if is_graphql else request.get("method") or "GET",
                "url": request.get("url") or "",
                "headers": _to_insomnia_key_values(request.get("headers")),
                "parameters": _to_insomnia_key_values(request.get("query")),
                "body": _to_insomnia_body(request),
                "authentication": _to_insomnia_auth(request.get("auth")),
                "metaSortKey": sort_keys["next"],
            }
        )

    payload = {
        "_type": "export",
        "__export_format": 4,
        "__export_date": datetime.now(timezone.utc).isoformat(),
        "__export_source": "pulse.export",
        "resources": resources,
    }
    return json.dumps(payload, indent=2, ensure_ascii=False)