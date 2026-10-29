"""Shared helpers for Postman / Bruno / Insomnia collection import and export."""

from __future__ import annotations

from typing import Any

from ._util import kv, uid

HTTP_METHODS = frozenset({"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "QUERY"})


def default_graphql_query() -> str:
    return "query Example {\n  __typename\n}"


def default_graphql_variables() -> str:
    return "{}"


def default_auth() -> dict:
    return {
        "authType": "none",
        "bearerToken": "",
        "basicUsername": "",
        "basicPassword": "",
        "apiKeyKey": "",
        "apiKeyValue": "",
        "apiKeyIn": "header",
        "oauthGrantType": "client_credentials",
        "oauthTokenUrl": "",
        "oauthAuthorizeUrl": "",
        "oauthClientId": "",
        "oauthClientSecret": "",
        "oauthScope": "",
        "oauthRedirectUri": "http://127.0.0.1:8080/callback",
        "oauthRefreshToken": "",
        "oauthCodeVerifier": "",
        "oauthAuthCode": "",
    }


def empty_multipart() -> list[dict]:
    return [
        {
            "id": uid("mp"),
            "key": "",
            "value": "",
            "enabled": True,
            "fieldType": "text",
        }
    ]


def parse_method(value: str | None) -> str:
    method = (value or "GET").upper()
    return method if method in HTTP_METHODS else "GET"


def empty_kv() -> dict:
    return kv("", "")


def parse_key_values(items: list[dict] | None, *, key_field: str = "key") -> list[dict]:
    if not items:
        return [empty_kv()]
    rows: list[dict] = []
    for item in items:
        key = str(item.get(key_field) or item.get("name") or item.get("key") or "")
        value = str(item.get("value") if item.get("value") is not None else "")
        enabled = not item.get("disabled", False) and item.get("enabled", True) is not False
        rows.append(kv(key, value, enabled))
    return rows if rows else [empty_kv()]


def to_key_values(items: list[dict] | None) -> list[dict]:
    return [
        kv(str(item.get("key") or ""), str(item.get("value") or ""), item.get("enabled", True) is not False)
        for item in items or []
        if str(item.get("key") or "").strip() or str(item.get("value") or "").strip()
    ]


def infer_protocol(url: str) -> str:
    lower = (url or "").lower()
    if lower.startswith("ws://") or lower.startswith("wss://"):
        return "websocket"
    return "http"


def create_request(partial: dict | None = None) -> dict:
    partial = partial or {}
    url = partial.get("url") or "https://httpbin.org/get"
    headers = partial.get("headers")
    if not headers:
        headers = [kv("Accept", "application/json")]
    else:
        headers = [
            kv(
                str(item.get("key") or ""),
                str(item.get("value") or ""),
                item.get("enabled", True) is not False,
            )
            for item in headers
        ]
    query = partial.get("query")
    if not query:
        query = [empty_kv()]
    else:
        query = [
            kv(
                str(item.get("key") or ""),
                str(item.get("value") or ""),
                item.get("enabled", True) is not False,
            )
            for item in query
        ]
    path_params = partial.get("pathParams") or []
    path_params = [
        kv(
            str(item.get("key") or ""),
            str(item.get("value") or ""),
            item.get("enabled", True) is not False,
        )
        for item in path_params
    ]
    auth = {**default_auth(), **(partial.get("auth") or {})}
    multipart = partial.get("multipart")
    if multipart is None:
        multipart = empty_multipart()
    else:
        multipart = [
            {
                "id": item.get("id") or uid("mp"),
                "key": str(item.get("key") or ""),
                "value": str(item.get("value") or ""),
                "enabled": item.get("enabled", True) is not False,
                "fieldType": item.get("fieldType") or "text",
                **({"fileName": item["fileName"]} if item.get("fileName") else {}),
                **({"mimeType": item["mimeType"]} if item.get("mimeType") else {}),
            }
            for item in multipart
        ]
    form = partial.get("form")
    if not form:
        form = [empty_kv()]
    else:
        form = [
            kv(
                str(item.get("key") or ""),
                str(item.get("value") or ""),
                item.get("enabled", True) is not False,
            )
            for item in form
        ]
    return {
        "id": partial.get("id") or uid("req"),
        "name": partial.get("name") or "Untitled Request",
        "protocol": partial.get("protocol") or infer_protocol(url),
        "method": partial.get("method") or "GET",
        "url": url,
        "headers": headers,
        "query": query,
        "pathParams": path_params,
        "bodyKind": partial.get("bodyKind") or "none",
        "body": partial.get("body") if partial.get("body") is not None else '{\n  \n}',
        "graphqlQuery": partial.get("graphqlQuery") or default_graphql_query(),
        "graphqlVariables": partial.get("graphqlVariables") or default_graphql_variables(),
        "graphqlOperationName": partial.get("graphqlOperationName") or "",
        "form": form,
        "multipart": multipart,
        "auth": auth,
        "tests": partial.get("tests") or "",
        "preRequestScript": partial.get("preRequestScript") or "",
        "responseSchema": partial.get("responseSchema") or "",
    }


def create_saved_request(request: dict, *, collection_id: str, folder: str | None = None, name: str | None = None) -> dict:
    return {
        "id": uid("saved"),
        "name": name or request.get("name") or "Untitled Request",
        "collectionId": collection_id,
        **({"folder": folder} if folder else {}),
        "request": request,
    }


def collect_folders(folder_paths: set[str], path: str) -> None:
    if not path.strip():
        return
    folder_paths.add(path)
    parts = path.split("/")
    if len(parts) > 1:
        collect_folders(folder_paths, "/".join(parts[:-1]))


def pulse_dump(collection: dict, collections: list[dict]) -> dict:
    return {
        "version": 1,
        "collectionGroups": [collection],
        "collections": collections,
    }


def group_requests_by_folder(
    items: list[dict],
    folder_paths: list[str] | None = None,
) -> dict[str, Any]:
    root: list[dict] = []
    node_map: dict[str, dict] = {}

    def ensure_node(path: str) -> dict:
        existing = node_map.get(path)
        if existing:
            return existing
        parts = path.split("/")
        name = parts[-1] if parts else path
        node = {"name": name, "path": path, "requests": [], "children": []}
        node_map[path] = node
        if len(parts) > 1:
            parent_path = "/".join(parts[:-1])
            parent = ensure_node(parent_path)
            if not any(child["path"] == path for child in parent["children"]):
                parent["children"].append(node)
        return node

    for item in items:
        folder = (item.get("folder") or "").strip()
        if not folder:
            root.append(item)
            continue
        ensure_node(folder)["requests"].append(item)

    for folder_path in folder_paths or []:
        normalized = folder_path.strip().strip("/")
        if normalized:
            ensure_node(normalized)

    order_index = {path: index for index, path in enumerate(folder_paths or [])}

    top_level = [node for node in node_map.values() if "/" not in node["path"]]
    top_level.sort(key=lambda node: (order_index.get(node["path"], 2**31 - 1), node["name"].lower()))
    for node in node_map.values():
        node["children"].sort(key=lambda child: (order_index.get(child["path"], 2**31 - 1), child["name"].lower()))

    return {"root": root, "folders": top_level}
