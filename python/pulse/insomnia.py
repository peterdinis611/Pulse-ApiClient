"""Insomnia export v4 import and export."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from .collections_io import (
    create_request,
    create_saved_request,
    default_auth,
    default_graphql_query,
    default_graphql_variables,
    empty_kv,
    parse_key_values,
    parse_method,
    pulse_dump,
)
from ._util import uid


def _parse_auth(auth: dict | None) -> dict:
    base = default_auth()
    if not auth or auth.get("disabled") or not auth.get("type") or auth.get("type") == "none":
        return base
    auth_type = auth.get("type")
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
        add_to = auth.get("addTo") or ""
        return {
            **base,
            "authType": "apiKey",
            "apiKeyKey": auth.get("key") or "",
            "apiKeyValue": auth.get("value") or "",
            "apiKeyIn": "query" if add_to in {"queryparams", "query"} else "header",
        }
    return base


def _parse_body(body: dict | None) -> dict:
    mime = (body.get("mimeType") or "").lower() if body else ""
    if not mime or mime == "application/octet-stream":
        if not (body or {}).get("text", "").strip() and not (body or {}).get("params"):
            return {
                "bodyKind": "none",
                "body": "",
                "form": [empty_kv()],
                "multipart": [],
                "graphqlQuery": default_graphql_query(),
                "graphqlVariables": default_graphql_variables(),
            }

    if "json" in mime or "graphql" in mime:
        if "graphql" in mime:
            try:
                parsed = json.loads((body or {}).get("text") or "{}")
                variables = parsed.get("variables")
                if not isinstance(variables, str):
                    variables = json.dumps(variables if variables is not None else {}, indent=2)
                return {
                    "bodyKind": "graphql",
                    "body": "",
                    "form": [empty_kv()],
                    "multipart": [],
                    "graphqlQuery": parsed.get("query") or default_graphql_query(),
                    "graphqlVariables": variables,
                }
            except json.JSONDecodeError:
                return {
                    "bodyKind": "graphql",
                    "body": "",
                    "form": [empty_kv()],
                    "multipart": [],
                    "graphqlQuery": (body or {}).get("text") or default_graphql_query(),
                    "graphqlVariables": default_graphql_variables(),
                }
        return {
            "bodyKind": "json",
            "body": (body or {}).get("text") or "",
            "form": [empty_kv()],
            "multipart": [],
            "graphqlQuery": default_graphql_query(),
            "graphqlVariables": default_graphql_variables(),
        }

    if "x-www-form-urlencoded" in mime:
        return {
            "bodyKind": "form",
            "body": "",
            "form": parse_key_values((body or {}).get("params"), key_field="name"),
            "multipart": [],
            "graphqlQuery": default_graphql_query(),
            "graphqlVariables": default_graphql_variables(),
        }

    if "multipart" in mime:
        multipart = [
            {
                "id": uid("mp"),
                "key": item.get("name") or "",
                "value": item.get("value") or "",
                "enabled": not item.get("disabled"),
                "fieldType": "file" if item.get("type") == "file" or item.get("fileName") else "text",
                **({"fileName": item["fileName"]} if item.get("fileName") else {}),
            }
            for item in (body or {}).get("params") or []
        ]
        return {
            "bodyKind": "multipart",
            "body": "",
            "form": [empty_kv()],
            "multipart": multipart,
            "graphqlQuery": default_graphql_query(),
            "graphqlVariables": default_graphql_variables(),
        }

    return {
        "bodyKind": "raw",
        "body": (body or {}).get("text") or "",
        "form": [empty_kv()],
        "multipart": [],
        "graphqlQuery": default_graphql_query(),
        "graphqlVariables": default_graphql_variables(),
    }


def _build_folder_path(resource_id: str, by_id: dict[str, dict], cache: dict[str, str]) -> str:
    if resource_id in cache:
        return cache[resource_id]
    resource = by_id.get(resource_id)
    if not resource or resource.get("_type") != "request_group":
        cache[resource_id] = ""
        return ""
    parent_path = _build_folder_path(resource["parentId"], by_id, cache) if resource.get("parentId") else ""
    name = (resource.get("name") or "").strip() or "Folder"
    path = f"{parent_path}/{name}" if parent_path else name
    cache[resource_id] = path
    return path


def _workspace_name(resources: list[dict]) -> str:
    for item in resources:
        if item.get("_type") in {"workspace", "project"}:
            return (item.get("name") or "").strip() or "Insomnia Collection"
    return "Insomnia Collection"


def is_insomnia_export(raw: str) -> bool:
    try:
        parsed = json.loads(raw)
        if not isinstance(parsed, dict):
            return False
        if parsed.get("_type") == "export" and isinstance(parsed.get("resources"), list):
            return True
        if isinstance(parsed.get("__export_format"), int) and isinstance(parsed.get("resources"), list):
            return True
        resources = parsed.get("resources")
        return bool(
            isinstance(resources, list)
            and any(item.get("_type") in {"request", "request_group"} for item in resources if isinstance(item, dict))
        )
    except (json.JSONDecodeError, TypeError):
        return False


def import_insomnia(raw: str) -> dict:
    parsed = json.loads(raw)
    resources = parsed.get("resources") if isinstance(parsed, dict) else None
    if not resources:
        raise ValueError("Insomnia export has no resources.")

    by_id = {item["_id"]: item for item in resources if isinstance(item, dict) and item.get("_id")}
    folder_cache: dict[str, str] = {}
    folder_paths: set[str] = set()
    collection_id = uid("col")
    requests: list[dict] = []

    for resource in resources:
        if resource.get("_type") != "request":
            continue
        folder = _build_folder_path(resource["parentId"], by_id, folder_cache) if resource.get("parentId") else ""
        if folder:
            parts = folder.split("/")
            for index in range(1, len(parts) + 1):
                folder_paths.add("/".join(parts[:index]))
        body = _parse_body(resource.get("body"))
        request = create_request(
            {
                "name": (resource.get("name") or "").strip() or "Untitled Request",
                "method": parse_method(resource.get("method")),
                "url": (resource.get("url") or "").strip(),
                "headers": parse_key_values(resource.get("headers"), key_field="name"),
                "query": parse_key_values(resource.get("parameters"), key_field="name"),
                "auth": _parse_auth(resource.get("authentication")),
                **body,
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
        "name": _workspace_name(resources),
        "source": "insomnia",
        "folders": sorted(folder_paths),
    }
    return pulse_dump(collection, requests)


def _to_insomnia_key_values(items: list[dict] | None) -> list[dict]:
    rows = []
    for item in items or []:
        key = str(item.get("key") or "")
        value = str(item.get("value") or "")
        if not key.strip() and not value.strip():
            continue
        row = {"name": key, "value": value}
        if item.get("enabled") is False:
            row["disabled"] = True
        rows.append(row)
    return rows


def _to_insomnia_auth(auth: dict | None) -> dict:
    if not auth or auth.get("authType") in {None, "none", "inherit"}:
        return {"type": "none"}
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
            "addTo": "queryparams" if auth.get("apiKeyIn") == "query" else "header",
        }
    return {"type": "none"}


def _to_insomnia_body(request: dict) -> dict:
    body_kind = request.get("bodyKind") or "none"
    if body_kind == "json":
        return {"mimeType": "application/json", "text": request.get("body") or ""}
    if body_kind == "graphql":
        try:
            variables = json.loads(request.get("graphqlVariables") or "{}")
        except json.JSONDecodeError:
            variables = {}
        return {
            "mimeType": "application/graphql",
            "text": json.dumps(
                {"query": request.get("graphqlQuery") or "", "variables": variables},
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
            "params": [
                {
                    "name": field.get("key") or "",
                    "value": "" if field.get("fieldType") == "file" else field.get("value") or "",
                    **({"disabled": True} if field.get("enabled") is False else {}),
                    **(
                        {"type": "file", "fileName": field.get("fileName") or ""}
                        if field.get("fieldType") == "file"
                        else {}
                    ),
                }
                for field in request.get("multipart") or []
                if str(field.get("key") or "").strip()
                or str(field.get("value") or "").strip()
                or field.get("fileName")
            ],
        }
    if body_kind == "raw":
        return {"mimeType": "text/plain", "text": request.get("body") or ""}
    return {"mimeType": None, "text": ""}


def _ensure_folder_ids(
    folder_path: str,
    workspace_id: str,
    folder_ids: dict[str, str],
    resources: list[dict],
) -> str:
    if not folder_path.strip():
        return workspace_id
    existing = folder_ids.get(folder_path)
    if existing:
        return existing
    parts = folder_path.split("/")
    parent_path = "/".join(parts[:-1])
    parent_id = _ensure_folder_ids(parent_path, workspace_id, folder_ids, resources) if parent_path else workspace_id
    folder_id = uid("fld")
    folder_ids[folder_path] = folder_id
    resources.append(
        {
            "_id": folder_id,
            "_type": "request_group",
            "parentId": parent_id,
            "name": parts[-1] if parts else "Folder",
        }
    )
    return folder_id


def export_insomnia(group: dict, requests: list[dict]) -> str:
    workspace_id = uid("wrk")
    resources: list[dict] = [
        {"_id": workspace_id, "_type": "workspace", "name": group.get("name") or "Collection", "parentId": None}
    ]
    folder_ids: dict[str, str] = {}
    for path in group.get("folders") or []:
        _ensure_folder_ids(path, workspace_id, folder_ids, resources)

    for saved in requests:
        folder = (saved.get("folder") or "").strip()
        parent_id = _ensure_folder_ids(folder, workspace_id, folder_ids, resources) if folder else workspace_id
        request = saved.get("request") or {}
        resources.append(
            {
                "_id": uid("req"),
                "_type": "request",
                "parentId": parent_id,
                "name": saved.get("name") or request.get("name") or "Request",
                "method": "POST" if request.get("bodyKind") == "graphql" else request.get("method") or "GET",
                "url": request.get("url") or "",
                "headers": _to_insomnia_key_values(request.get("headers")),
                "parameters": _to_insomnia_key_values(request.get("query")),
                "body": _to_insomnia_body(request),
                "authentication": _to_insomnia_auth(request.get("auth")),
            }
        )

    payload = {
        "_type": "export",
        "__export_format": 4,
        "__export_date": datetime.now(timezone.utc).isoformat(),
        "__export_source": "pulse.export",
        "resources": resources,
    }
    return json.dumps(payload, indent=2)
