"""Postman collection v2.1 import and export."""

from __future__ import annotations

import json
import uuid
from typing import Any

from .collections_io import (
    collect_folders,
    create_request,
    create_saved_request,
    default_auth,
    default_graphql_query,
    default_graphql_variables,
    empty_kv,
    empty_multipart,
    group_requests_by_folder,
    parse_key_values,
    parse_method,
    pulse_dump,
)
from ._util import uid


def _parse_url(
    url: str | dict | None,
    query_from_url: list[dict] | None = None,
) -> tuple[str, list[dict], list[dict]]:
    if isinstance(url, str):
        return url, parse_key_values(query_from_url), []
    if not url:
        return "", parse_key_values(query_from_url), []
    path_params = [row for row in parse_key_values(url.get("variable")) if str(row.get("key") or "").strip()]
    if str(url.get("raw") or "").strip():
        return str(url["raw"]), parse_key_values(url.get("query") or query_from_url), path_params
    host = ".".join(url.get("host") or [])
    path = "/".join(url.get("path") or [])
    built = "/".join(part for part in (host, path) if part)
    normalized = built if built.startswith("http") else f"https://{built}"
    return normalized, parse_key_values(url.get("query") or query_from_url), path_params


def _parse_auth(auth: dict | None, missing: str = "inherit") -> dict:
    base = default_auth()
    if not auth or not auth.get("type"):
        if missing == "inherit":
            return {**base, "authType": "inherit"}
        return base
    auth_type = auth.get("type")
    if auth_type == "noauth":
        return base
    if auth_type == "inherit":
        return {**base, "authType": "inherit"}
    if auth_type == "bearer":
        token = next((item.get("value") for item in auth.get("bearer") or [] if item.get("key") == "token"), "")
        return {**base, "authType": "bearer", "bearerToken": token or ""}
    if auth_type == "basic":
        return {
            **base,
            "authType": "basic",
            "basicUsername": next(
                (item.get("value") for item in auth.get("basic") or [] if item.get("key") == "username"),
                "",
            )
            or "",
            "basicPassword": next(
                (item.get("value") for item in auth.get("basic") or [] if item.get("key") == "password"),
                "",
            )
            or "",
        }
    if auth_type == "apikey":
        apikey = auth.get("apikey") or []
        key_entry = next((item for item in apikey if item.get("key") == "key"), {})
        value_entry = next((item for item in apikey if item.get("key") == "value"), {})
        in_entry = next((item for item in apikey if item.get("key") == "in"), {})
        return {
            **base,
            "authType": "apiKey",
            "apiKeyKey": key_entry.get("value") or "",
            "apiKeyValue": value_entry.get("value") or "",
            "apiKeyIn": "query" if in_entry.get("value") == "query" else "header",
        }
    return base


def _parse_body(body: dict | None) -> dict:
    if body and body.get("mode") == "graphql":
        return {
            "bodyKind": "graphql",
            "body": "",
            "graphqlQuery": (body.get("graphql") or {}).get("query") or default_graphql_query(),
            "graphqlVariables": (body.get("graphql") or {}).get("variables") or default_graphql_variables(),
            "graphqlOperationName": "",
            "form": [empty_kv()],
            "multipart": empty_multipart(),
        }
    if not body or not body.get("mode") or body.get("mode") == "raw":
        return {
            "bodyKind": "raw" if body and body.get("mode") == "raw" else "none",
            "body": body.get("raw") if body else "",
            "graphqlQuery": default_graphql_query(),
            "graphqlVariables": default_graphql_variables(),
            "graphqlOperationName": "",
            "form": [empty_kv()],
            "multipart": empty_multipart(),
        }
    if body.get("mode") == "urlencoded":
        return {
            "bodyKind": "form",
            "body": "",
            "graphqlQuery": default_graphql_query(),
            "graphqlVariables": default_graphql_variables(),
            "graphqlOperationName": "",
            "form": parse_key_values(body.get("urlencoded")),
            "multipart": empty_multipart(),
        }
    if body.get("mode") == "formdata":
        multipart = [
            {
                "id": uid("mp"),
                "key": str(field.get("key") or ""),
                "value": str(field.get("value") or ""),
                "enabled": not field.get("disabled"),
                "fieldType": "file" if field.get("type") == "file" else "text",
                **({"fileName": field["src"]} if field.get("type") == "file" and field.get("src") else {}),
            }
            for field in body.get("formdata") or []
        ]
        return {
            "bodyKind": "multipart",
            "body": "",
            "graphqlQuery": default_graphql_query(),
            "graphqlVariables": default_graphql_variables(),
            "graphqlOperationName": "",
            "form": [empty_kv()],
            "multipart": multipart if multipart else empty_multipart(),
        }
    return {
        "bodyKind": "none",
        "body": "",
        "graphqlQuery": default_graphql_query(),
        "graphqlVariables": default_graphql_variables(),
        "graphqlOperationName": "",
        "form": [empty_kv()],
        "multipart": empty_multipart(),
    }


def _parse_script(item: dict, listen: str) -> str | None:
    for event in item.get("event") or []:
        if event.get("listen") != listen:
            continue
        exec_val = (event.get("script") or {}).get("exec")
        if not exec_val:
            return None
        return "\n".join(exec_val) if isinstance(exec_val, list) else str(exec_val)
    return None


def _parse_postman_request(item: dict) -> dict | None:
    request = item.get("request")
    if not request:
        return None
    url, query, path_params = _parse_url(request.get("url"))
    body = _parse_body(request.get("body"))
    method = "POST" if body["bodyKind"] == "graphql" else parse_method(request.get("method"))
    return create_request(
        {
            "name": (item.get("name") or "").strip() or "Untitled Request",
            "method": method,
            "url": url,
            "headers": parse_key_values(request.get("header")),
            "query": query,
            "pathParams": path_params,
            "auth": _parse_auth(request.get("auth")),
            "tests": _parse_script(item, "test") or "",
            "preRequestScript": _parse_script(item, "prerequest") or "",
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
        if isinstance(item.get("item"), list):
            next_folder = (
                f"{folder_path}/{item.get('name') or 'Folder'}"
                if folder_path
                else (item.get("name") or "Folder")
            )
            collect_folders(folder_paths, next_folder)
            _walk_items(item["item"], collection_id, next_folder, requests, folder_paths)
            continue
        parsed = _parse_postman_request(item)
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


def is_postman_collection(raw: str) -> bool:
    try:
        parsed = json.loads(raw)
        collection = parsed.get("collection") if isinstance(parsed, dict) else None
        collection = collection if collection is not None else parsed
        if not isinstance(collection, dict):
            return False
        info = collection.get("info") or {}
        return bool(
            "postman" in str(info.get("schema") or "")
            or (info.get("name") and collection.get("item"))
        )
    except (json.JSONDecodeError, TypeError):
        return False


def import_postman(raw: str) -> dict:
    parsed = json.loads(raw)
    collection_data = parsed.get("collection") if isinstance(parsed, dict) else None
    collection_data = collection_data if collection_data is not None else parsed
    if not isinstance(collection_data, dict) or not collection_data.get("item"):
        raise ValueError("Postman collection has no requests.")

    collection_id = uid("col")
    folder_paths: set[str] = set()
    requests: list[dict] = []
    _walk_items(collection_data.get("item"), collection_id, "", requests, folder_paths)

    if not requests:
        raise ValueError("No valid requests found in Postman collection.")

    info = collection_data.get("info") or {}
    collection: dict[str, Any] = {
        "id": collection_id,
        "name": (info.get("name") or "").strip() or "Imported Collection",
        "source": "postman",
        "folders": sorted(folder_paths),
    }
    variables = [row for row in parse_key_values(collection_data.get("variable")) if str(row.get("key") or "").strip()]
    if variables:
        collection["variables"] = variables
    if collection_data.get("auth"):
        collection["auth"] = _parse_auth(collection_data["auth"], missing="none")
    pre = _parse_script(collection_data, "prerequest") or ""
    tests = _parse_script(collection_data, "test") or ""
    if pre:
        collection["preRequestScript"] = pre
    if tests:
        collection["tests"] = tests

    return pulse_dump(collection, requests)


def _to_postman_key_values(items: list[dict] | None) -> list[dict]:
    rows = []
    for item in items or []:
        key = str(item.get("key") or "")
        value = str(item.get("value") or "")
        if not key.strip() and not value.strip():
            continue
        row = {"key": key, "value": value}
        if item.get("enabled") is False:
            row["disabled"] = True
        rows.append(row)
    return rows


def _to_postman_auth(auth: dict | None) -> dict | None:
    if not auth or auth.get("authType") in {None, "none"}:
        return None
    auth_type = auth.get("authType")
    if auth_type == "inherit":
        return {"type": "inherit"}
    if auth_type == "bearer":
        return {
            "type": "bearer",
            "bearer": [{"key": "token", "value": auth.get("bearerToken") or "", "type": "string"}],
        }
    if auth_type == "basic":
        return {
            "type": "basic",
            "basic": [
                {"key": "username", "value": auth.get("basicUsername") or "", "type": "string"},
                {"key": "password", "value": auth.get("basicPassword") or "", "type": "string"},
            ],
        }
    if auth_type == "apiKey":
        return {
            "type": "apikey",
            "apikey": [
                {"key": "key", "value": auth.get("apiKeyKey") or "", "type": "string"},
                {"key": "value", "value": auth.get("apiKeyValue") or "", "type": "string"},
                {"key": "in", "value": auth.get("apiKeyIn") or "header", "type": "string"},
            ],
        }
    return None


def _to_postman_events(pre_request_script: str | None, tests: str | None) -> list[dict] | None:
    events = []
    if (pre_request_script or "").strip():
        events.append(
            {
                "listen": "prerequest",
                "script": {"type": "text/javascript", "exec": pre_request_script.split("\n")},
            }
        )
    if (tests or "").strip():
        events.append(
            {
                "listen": "test",
                "script": {"type": "text/javascript", "exec": tests.split("\n")},
            }
        )
    return events or None


def _to_postman_body(request: dict) -> dict | None:
    body_kind = request.get("bodyKind") or "none"
    if body_kind == "none":
        return None
    if body_kind == "graphql":
        return {
            "mode": "graphql",
            "graphql": {
                "query": request.get("graphqlQuery") or "",
                "variables": request.get("graphqlVariables") or "",
            },
        }
    if body_kind == "form":
        return {"mode": "urlencoded", "urlencoded": _to_postman_key_values(request.get("form"))}
    if body_kind == "multipart":
        formdata = []
        for field in request.get("multipart") or []:
            key = str(field.get("key") or "")
            value = str(field.get("value") or "")
            file_name = field.get("fileName")
            if not key.strip() and not value.strip() and not file_name:
                continue
            row: dict = {
                "key": key,
                "value": file_name if field.get("fieldType") == "file" else value,
                "type": "file" if field.get("fieldType") == "file" else "text",
            }
            if field.get("enabled") is False:
                row["disabled"] = True
            formdata.append(row)
        return {"mode": "formdata", "formdata": formdata}
    return {"mode": "raw", "raw": request.get("body") or ""}


def _to_postman_request(saved: dict) -> dict:
    request = saved.get("request") or {}
    query = _to_postman_key_values(request.get("query"))
    path_params = _to_postman_key_values(request.get("pathParams"))
    body = _to_postman_body(request)
    auth = _to_postman_auth(request.get("auth"))
    url: str | dict = request.get("url") or ""
    if query or path_params:
        url = {"raw": url}
        if query:
            url["query"] = query
        if path_params:
            url["variable"] = path_params
    postman_request: dict = {
        "method": "POST" if request.get("bodyKind") == "graphql" else request.get("method") or "GET",
        "header": _to_postman_key_values(request.get("headers")),
        "url": url,
    }
    if body:
        postman_request["body"] = body
    if auth:
        postman_request["auth"] = auth
    item = {"name": saved.get("name") or request.get("name") or "Request", "request": postman_request}
    event = _to_postman_events(request.get("preRequestScript"), request.get("tests"))
    if event:
        item["event"] = event
    return item


def _folder_to_postman_item(folder: dict) -> dict:
    children = [_to_postman_request(saved) for saved in folder.get("requests") or []]
    children.extend(_folder_to_postman_item(child) for child in folder.get("children") or [])
    return {"name": folder.get("name") or "Folder", "item": children}


def export_postman(group: dict, requests: list[dict]) -> str:
    grouped = group_requests_by_folder(requests, group.get("folders") or [])
    items = [_to_postman_request(saved) for saved in grouped["root"]]
    items.extend(_folder_to_postman_item(folder) for folder in grouped["folders"])
    collection: dict = {
        "info": {
            "_postman_id": str(uuid.uuid4()),
            "name": group.get("name") or "Collection",
            "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
        },
        "item": items,
    }
    auth = _to_postman_auth(group.get("auth"))
    variable = _to_postman_key_values(group.get("variables"))
    event = _to_postman_events(group.get("preRequestScript"), group.get("tests"))
    if auth:
        collection["auth"] = auth
    if variable:
        collection["variable"] = variable
    if event:
        collection["event"] = event
    return json.dumps(collection, indent=2)
