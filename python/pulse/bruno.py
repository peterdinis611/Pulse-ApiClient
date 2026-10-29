"""Bruno collection JSON import and export."""

from __future__ import annotations

import json
from typing import Any

from ._util import kv, uid
from .collections_io import (
    collect_folders,
    create_request,
    create_saved_request,
    default_auth,
    default_graphql_query,
    default_graphql_variables,
    empty_kv,
    group_requests_by_folder,
    parse_key_values,
    parse_method,
    pulse_dump,
)

_BRUNO_ITEM_TYPES = {"http", "graphql", "folder"}
_TEXT_BODY_MODES = {"text", "xml", "sparql"}
_FORM_MODES = {"formurlencoded", "form-urlencoded"}
_MULTIPART_MODES = {"multipartform", "multipart-form"}


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #

def _as_string(value: object) -> str:
    return "" if value is None else str(value)


def _as_dict(value: object) -> dict:
    """Return ``value`` if it is a dict, otherwise an empty dict."""
    return value if isinstance(value, dict) else {}


def _lower(value: object) -> str:
    return value.lower() if isinstance(value, str) else ""


# --------------------------------------------------------------------------- #
# Import
# --------------------------------------------------------------------------- #

def _parse_auth(auth: dict | None) -> dict:
    base = default_auth()
    auth = _as_dict(auth)
    mode = _lower(auth.get("mode"))

    if mode == "bearer":
        token = _as_dict(auth.get("bearer")).get("token") or ""
        return {**base, "authType": "bearer", "bearerToken": token}

    if mode == "basic":
        basic = _as_dict(auth.get("basic"))
        return {
            **base,
            "authType": "basic",
            "basicUsername": basic.get("username") or "",
            "basicPassword": basic.get("password") or "",
        }

    if mode == "apikey":
        apikey = _as_dict(auth.get("apikey"))
        placement = _lower(apikey.get("placement"))
        return {
            **base,
            "authType": "apiKey",
            "apiKeyKey": apikey.get("key") or "",
            "apiKeyValue": apikey.get("value") or "",
            "apiKeyIn": "query" if placement in {"query", "queryparams"} else "header",
        }

    return base  # none / inherit / unknown


def _body_fields(**overrides: Any) -> dict:
    """Body field set with defaults; each body mode only overrides what it needs."""
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


def _parse_multipart(items: list[dict] | None) -> list[dict]:
    return [
        {
            "id": uid("mp"),
            "key": _as_string(item.get("name")),
            "value": _as_string(item.get("value")),
            "enabled": item.get("enabled") is not False,
            "fieldType": "file" if item.get("type") == "file" else "text",
        }
        for item in items or []
        if isinstance(item, dict)
    ]


def _parse_body(body: dict | None) -> dict:
    body = _as_dict(body)
    mode = _lower(body.get("mode")) or "none"

    if mode == "json":
        return _body_fields(bodyKind="json", body=body.get("json") or "")

    if mode in _TEXT_BODY_MODES:
        text = body.get("text") or body.get("xml") or body.get("sparql") or ""
        return _body_fields(bodyKind="raw", body=text)

    if mode in _FORM_MODES:
        return _body_fields(
            bodyKind="form",
            form=parse_key_values(body.get("formUrlEncoded"), key_field="name"),
        )

    if mode in _MULTIPART_MODES:
        return _body_fields(
            bodyKind="multipart",
            multipart=_parse_multipart(body.get("multipartForm")),
        )

    if mode == "graphql":
        graphql = _as_dict(body.get("graphql"))
        return _body_fields(
            bodyKind="graphql",
            graphqlQuery=graphql.get("query") or default_graphql_query(),
            graphqlVariables=graphql.get("variables") or default_graphql_variables(),
        )

    return _body_fields()


def _parse_params(params: list[dict] | None) -> tuple[list[dict], list[dict]]:
    query: list[dict] = []
    path_vars: list[dict] = []
    for param in params or []:
        if not isinstance(param, dict):
            continue
        entry = kv(
            _as_string(param.get("name")),
            _as_string(param.get("value")),
            param.get("enabled") is not False,
        )
        (path_vars if param.get("type") == "path" else query).append(entry)
    return (query or [empty_kv()], path_vars)


def _apply_path_vars(url: str, path_vars: list[dict]) -> str:
    for item in path_vars:
        key = _as_string(item.get("key")).strip()
        if not key:
            continue
        value = _as_string(item.get("value"))
        url = url.replace(f":{key}", value).replace(f"{{{key}}}", value)
    return url


def _parse_bruno_request(item: dict) -> dict | None:
    request = item.get("request")
    if not isinstance(request, dict):
        return None

    query, path_vars = _parse_params(request.get("params"))
    return create_request(
        {
            "name": _as_string(item.get("name")).strip() or "Untitled Request",
            "method": parse_method(request.get("method")),
            "url": _apply_path_vars(_as_string(request.get("url")).strip(), path_vars),
            "headers": parse_key_values(request.get("headers"), key_field="name"),
            "query": query,
            "auth": _parse_auth(request.get("auth")),
            **_parse_body(request.get("body")),
        }
    )


def _is_folder(item: dict) -> bool:
    if item.get("type") == "folder":
        return True
    return isinstance(item.get("items"), list) and bool(item["items"]) and not item.get("request")


def _walk_items(
    items: list[dict] | None,
    collection_id: str,
    folder_path: str,
    requests: list[dict],
    folder_paths: set[str],
) -> None:
    for item in items or []:
        if not isinstance(item, dict):
            continue

        if _is_folder(item):
            name = _as_string(item.get("name")).strip() or "Folder"
            next_folder = f"{folder_path}/{name}" if folder_path else name
            collect_folders(folder_paths, next_folder)
            _walk_items(item.get("items"), collection_id, next_folder, requests, folder_paths)
            continue

        parsed = _parse_bruno_request(item)
        if not parsed:
            continue

        if folder_path:
            collect_folders(folder_paths, folder_path)
        requests.append(
            create_saved_request(
                parsed,
                collection_id=collection_id,
                folder=folder_path or None,
                name=_as_string(item.get("name")).strip() or parsed["name"],
            )
        )


def is_bruno_collection(raw: str) -> bool:
    try:
        parsed = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return False

    if not isinstance(parsed, dict):
        return False
    if parsed.get("brunoConfig"):
        return True

    items = parsed.get("items")
    if not isinstance(items, list) or not isinstance(parsed.get("name"), str):
        return False
    if parsed.get("version") is not None:
        return True

    return any(
        isinstance(entry, dict)
        and (entry.get("type") in _BRUNO_ITEM_TYPES or entry.get("request"))
        for entry in items
    )


def import_bruno(raw: str) -> dict:
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid Bruno JSON: {exc.msg} (line {exc.lineno}).") from exc

    if not isinstance(parsed, dict) or not parsed.get("items"):
        raise ValueError("Bruno collection has no requests.")

    collection_id = uid("col")
    folder_paths: set[str] = set()
    requests: list[dict] = []
    _walk_items(parsed["items"], collection_id, "", requests, folder_paths)

    if not requests:
        raise ValueError("No valid requests found in Bruno collection.")

    collection: dict[str, Any] = {
        "id": collection_id,
        "name": _as_string(parsed.get("name")).strip() or "Bruno Collection",
        "source": "bruno",
        "folders": sorted(folder_paths),
    }
    return pulse_dump(collection, requests)


# --------------------------------------------------------------------------- #
# Export
# --------------------------------------------------------------------------- #

def _to_bruno_key_values(items: list[dict] | None, param_type: str | None = None) -> list[dict]:
    rows = []
    for item in items or []:
        key = _as_string(item.get("key"))
        value = _as_string(item.get("value"))
        if not key.strip() and not value.strip():
            continue
        row = {"name": key, "value": value, "enabled": item.get("enabled") is not False}
        if param_type:
            row["type"] = param_type
        rows.append(row)
    return rows


def _to_bruno_auth(auth: dict | None) -> dict:
    auth = _as_dict(auth)
    auth_type = auth.get("authType")

    if auth_type == "bearer":
        return {"mode": "bearer", "bearer": {"token": auth.get("bearerToken") or ""}}
    if auth_type == "basic":
        return {
            "mode": "basic",
            "basic": {
                "username": auth.get("basicUsername") or "",
                "password": auth.get("basicPassword") or "",
            },
        }
    if auth_type == "apiKey":
        return {
            "mode": "apikey",
            "apikey": {
                "key": auth.get("apiKeyKey") or "",
                "value": auth.get("apiKeyValue") or "",
                "placement": "query" if auth.get("apiKeyIn") == "query" else "header",
            },
        }
    return {"mode": "none"}


def _to_bruno_multipart(fields: list[dict] | None) -> list[dict]:
    rows = []
    for field in fields or []:
        is_file = field.get("fieldType") == "file"
        key = _as_string(field.get("key"))
        value = _as_string(field.get("fileName") if is_file else field.get("value"))
        if not key.strip() and not value.strip():
            continue
        rows.append(
            {
                "name": key,
                "value": value,
                "enabled": field.get("enabled") is not False,
                "type": "file" if is_file else "text",
            }
        )
    return rows


def _to_bruno_body(request: dict) -> dict:
    body_kind = request.get("bodyKind") or "none"

    if body_kind == "json":
        return {"mode": "json", "json": request.get("body") or ""}
    if body_kind == "raw":
        return {"mode": "text", "text": request.get("body") or ""}
    if body_kind == "form":
        return {"mode": "formUrlEncoded", "formUrlEncoded": _to_bruno_key_values(request.get("form"))}
    if body_kind == "multipart":
        return {"mode": "multipartForm", "multipartForm": _to_bruno_multipart(request.get("multipart"))}
    if body_kind == "graphql":
        return {
            "mode": "graphql",
            "graphql": {
                "query": request.get("graphqlQuery") or "",
                "variables": request.get("graphqlVariables") or "",
            },
        }
    return {"mode": "none"}


def _to_bruno_request(saved: dict) -> dict:
    request = saved.get("request") or {}
    is_graphql = (request.get("bodyKind") or "none") == "graphql"
    params = _to_bruno_key_values(request.get("query"), "query") + _to_bruno_key_values(
        request.get("pathParams"), "path"
    )
    return {
        "type": "graphql" if is_graphql else "http",
        "name": saved.get("name") or request.get("name") or "Request",
        "request": {
            "url": request.get("url") or "",
            "method": "POST" if is_graphql else request.get("method") or "GET",
            "headers": _to_bruno_key_values(request.get("headers")),
            "params": params,
            "body": _to_bruno_body(request),
            "auth": _to_bruno_auth(request.get("auth")),
        },
    }


def _folder_to_bruno_item(folder: dict) -> dict:
    return {
        "type": "folder",
        "name": folder.get("name") or "Folder",
        "items": [_to_bruno_request(saved) for saved in folder.get("requests") or []]
        + [_folder_to_bruno_item(child) for child in folder.get("children") or []],
    }


def export_bruno(group: dict, requests: list[dict]) -> str:
    grouped = group_requests_by_folder(requests, group.get("folders") or [])
    items = [_to_bruno_request(saved) for saved in grouped["root"]]
    items.extend(_folder_to_bruno_item(folder) for folder in grouped["folders"])
    payload = {"name": group.get("name") or "Collection", "version": "1", "items": items}
    return json.dumps(payload, indent=2, ensure_ascii=False)