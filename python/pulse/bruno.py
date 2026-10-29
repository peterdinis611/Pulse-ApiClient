"""Bruno collection JSON import and export."""

from __future__ import annotations

import json
from typing import Any

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
from ._util import kv, uid


def _as_string(value: object) -> str:
    if value is None:
        return ""
    return str(value)


def _parse_auth(auth: dict | None) -> dict:
    base = default_auth()
    mode = (auth.get("mode") or "").lower() if auth else ""
    if not mode or mode in {"none", "inherit"}:
        return base
    if mode == "bearer":
        return {**base, "authType": "bearer", "bearerToken": (auth.get("bearer") or {}).get("token") or ""}
    if mode == "basic":
        basic = auth.get("basic") or {}
        return {
            **base,
            "authType": "basic",
            "basicUsername": basic.get("username") or "",
            "basicPassword": basic.get("password") or "",
        }
    if mode == "apikey":
        apikey = auth.get("apikey") or {}
        placement = (apikey.get("placement") or "").lower()
        return {
            **base,
            "authType": "apiKey",
            "apiKeyKey": apikey.get("key") or "",
            "apiKeyValue": apikey.get("value") or "",
            "apiKeyIn": "query" if placement in {"query", "queryparams"} else "header",
        }
    return base


def _parse_body(body: dict | None) -> dict:
    mode = (body.get("mode") or "none").lower() if body else "none"
    if mode == "json":
        return {
            "bodyKind": "json",
            "body": body.get("json") if body else "",
            "form": [empty_kv()],
            "multipart": [],
            "graphqlQuery": default_graphql_query(),
            "graphqlVariables": default_graphql_variables(),
        }
    if mode in {"text", "xml", "sparql"}:
        text = (body or {}).get("text") or (body or {}).get("xml") or (body or {}).get("sparql") or ""
        return {
            "bodyKind": "raw",
            "body": text,
            "form": [empty_kv()],
            "multipart": [],
            "graphqlQuery": default_graphql_query(),
            "graphqlVariables": default_graphql_variables(),
        }
    if mode in {"formurlencoded", "form-urlencoded"}:
        return {
            "bodyKind": "form",
            "body": "",
            "form": parse_key_values((body or {}).get("formUrlEncoded"), key_field="name"),
            "multipart": [],
            "graphqlQuery": default_graphql_query(),
            "graphqlVariables": default_graphql_variables(),
        }
    if mode in {"multipartform", "multipart-form"}:
        multipart = [
            {
                "id": uid("mp"),
                "key": _as_string(item.get("name")),
                "value": _as_string(item.get("value")),
                "enabled": item.get("enabled") is not False,
                "fieldType": "file" if item.get("type") == "file" else "text",
            }
            for item in (body or {}).get("multipartForm") or []
        ]
        return {
            "bodyKind": "multipart",
            "body": "",
            "form": [empty_kv()],
            "multipart": multipart,
            "graphqlQuery": default_graphql_query(),
            "graphqlVariables": default_graphql_variables(),
        }
    if mode == "graphql":
        graphql = (body or {}).get("graphql") or {}
        return {
            "bodyKind": "graphql",
            "body": "",
            "form": [empty_kv()],
            "multipart": [],
            "graphqlQuery": graphql.get("query") or default_graphql_query(),
            "graphqlVariables": graphql.get("variables") or default_graphql_variables(),
        }
    return {
        "bodyKind": "none",
        "body": "",
        "form": [empty_kv()],
        "multipart": [],
        "graphqlQuery": default_graphql_query(),
        "graphqlVariables": default_graphql_variables(),
    }


def _parse_params(params: list[dict] | None) -> tuple[list[dict], list[dict]]:
    query: list[dict] = []
    path_vars: list[dict] = []
    for param in params or []:
        entry = kv(_as_string(param.get("name")), _as_string(param.get("value")), param.get("enabled") is not False)
        if param.get("type") == "path":
            path_vars.append(entry)
        else:
            query.append(entry)
    return (query if query else [empty_kv()], path_vars)


def _apply_path_vars(url: str, path_vars: list[dict]) -> str:
    result = url
    for item in path_vars:
        key = str(item.get("key") or "").strip()
        if not key:
            continue
        value = str(item.get("value") or "")
        result = result.replace(f":{key}", value).replace(f"{{{key}}}", value)
    return result


def _parse_bruno_request(item: dict) -> dict | None:
    request = item.get("request")
    if not request:
        return None
    query, path_vars = _parse_params(request.get("params"))
    body = _parse_body(request.get("body"))
    return create_request(
        {
            "name": (item.get("name") or "").strip() or "Untitled Request",
            "method": parse_method(request.get("method")),
            "url": _apply_path_vars((request.get("url") or "").strip(), path_vars),
            "headers": parse_key_values(request.get("headers"), key_field="name"),
            "query": query,
            "auth": _parse_auth(request.get("auth")),
            **body,
        }
    )


def _walk_items(
    items: list[dict] | None,
    collection_id: str,
    folder_path: str,
    requests: list[dict],
    folder_paths: set[str],
) -> None:
    for item in items or []:
        is_folder = item.get("type") == "folder" or (
            isinstance(item.get("items"), list) and item["items"] and not item.get("request")
        )
        if is_folder:
            next_folder = (
                f"{folder_path}/{item.get('name') or 'Folder'}"
                if folder_path
                else (item.get("name") or "Folder")
            )
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
                name=(item.get("name") or "").strip() or parsed["name"],
            )
        )


def is_bruno_collection(raw: str) -> bool:
    try:
        parsed = json.loads(raw)
        if not isinstance(parsed, dict):
            return False
        if parsed.get("brunoConfig"):
            return True
        items = parsed.get("items")
        if not isinstance(items, list):
            return False
        if not isinstance(parsed.get("name"), str):
            return False
        return bool(
            parsed.get("version") is not None
            or any(
                (entry or {}).get("type") in {"http", "graphql", "folder"} or (entry or {}).get("request")
                for entry in items
            )
        )
    except (json.JSONDecodeError, TypeError):
        return False


def import_bruno(raw: str) -> dict:
    parsed = json.loads(raw)
    if not isinstance(parsed, dict) or not parsed.get("items"):
        raise ValueError("Bruno collection has no requests.")

    collection_id = uid("col")
    folder_paths: set[str] = set()
    requests: list[dict] = []
    _walk_items(parsed.get("items"), collection_id, "", requests, folder_paths)

    if not requests:
        raise ValueError("No valid requests found in Bruno collection.")

    collection: dict[str, Any] = {
        "id": collection_id,
        "name": (parsed.get("name") or "").strip() or "Bruno Collection",
        "source": "bruno",
        "folders": sorted(folder_paths),
    }
    return pulse_dump(collection, requests)


def _to_bruno_key_values(items: list[dict] | None, param_type: str | None = None) -> list[dict]:
    rows = []
    for item in items or []:
        key = str(item.get("key") or "")
        value = str(item.get("value") or "")
        if not key.strip() and not value.strip():
            continue
        row = {"name": key, "value": value, "enabled": item.get("enabled") is not False}
        if param_type:
            row["type"] = param_type
        rows.append(row)
    return rows


def _to_bruno_auth(auth: dict | None) -> dict:
    if not auth or auth.get("authType") in {None, "none", "inherit"}:
        return {"mode": "none"}
    auth_type = auth.get("authType")
    if auth_type == "bearer":
        return {"mode": "bearer", "bearer": {"token": auth.get("bearerToken") or ""}}
    if auth_type == "basic":
        return {
            "mode": "basic",
            "basic": {"username": auth.get("basicUsername") or "", "password": auth.get("basicPassword") or ""},
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


def _to_bruno_body(request: dict) -> dict:
    body_kind = request.get("bodyKind") or "none"
    if body_kind == "json":
        return {"mode": "json", "json": request.get("body") or ""}
    if body_kind == "raw":
        return {"mode": "text", "text": request.get("body") or ""}
    if body_kind == "form":
        return {"mode": "formUrlEncoded", "formUrlEncoded": _to_bruno_key_values(request.get("form"))}
    if body_kind == "multipart":
        return {
            "mode": "multipartForm",
            "multipartForm": [
                {
                    "name": field.get("key") or "",
                    "value": field.get("fileName") if field.get("fieldType") == "file" else field.get("value") or "",
                    "enabled": field.get("enabled") is not False,
                    "type": "file" if field.get("fieldType") == "file" else "text",
                }
                for field in request.get("multipart") or []
                if str(field.get("key") or "").strip()
                or str(field.get("value") or "").strip()
                or field.get("fileName")
            ],
        }
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
    params = _to_bruno_key_values(request.get("query"), "query") + _to_bruno_key_values(
        request.get("pathParams"), "path"
    )
    body_kind = request.get("bodyKind") or "none"
    return {
        "type": "graphql" if body_kind == "graphql" else "http",
        "name": saved.get("name") or request.get("name") or "Request",
        "request": {
            "url": request.get("url") or "",
            "method": "POST" if body_kind == "graphql" else request.get("method") or "GET",
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
    return json.dumps({"name": group.get("name") or "Collection", "version": "1", "items": items}, indent=2)
