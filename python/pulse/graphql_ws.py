"""graphql-transport-ws / graphql-ws frame helpers (Rust via pulse_native when available)."""

from __future__ import annotations

import json
from typing import Any


def protocols() -> str:
    try:
        from pulse.native import load_native

        native = load_native()
        if hasattr(native, "graphql_ws_protocols"):
            return str(native.graphql_ws_protocols())
    except SystemExit:
        pass
    return "graphql-transport-ws, graphql-ws"


def connection_init(payload: dict[str, Any] | None = None, auth: dict[str, Any] | None = None) -> str:
    try:
        from pulse.native import load_native

        native = load_native()
        if hasattr(native, "graphql_ws_frame_json"):
            return native.graphql_ws_frame_json(
                "connection_init",
                None,
                None,
                None,
                None,
                json.dumps(payload) if payload is not None else None,
                json.dumps(auth) if auth is not None else None,
            )
    except SystemExit:
        pass
    body: dict[str, Any] = {"type": "connection_init"}
    if payload is not None:
        body["payload"] = payload
    elif auth:
        mapped = connection_init_payload_from_auth(auth)
        body["payload"] = mapped or {}
    else:
        body["payload"] = {}
    return json.dumps(body)


def connection_init_payload_from_auth(auth: dict[str, Any]) -> dict[str, str] | None:
    auth_type = str(auth.get("authType") or auth.get("auth_type") or "none")
    if auth_type in ("bearer", "oauth2"):
        token = str(auth.get("bearerToken") or auth.get("bearer_token") or "").strip()
        if token:
            return {"Authorization": f"Bearer {token}"}
    if auth_type == "apiKey":
        key = str(auth.get("apiKeyKey") or auth.get("api_key_key") or "").strip()
        if key and str(auth.get("apiKeyIn") or auth.get("api_key_in") or "header") != "query":
            return {key: str(auth.get("apiKeyValue") or auth.get("api_key_value") or "")}
    return None


def subscribe(
    id: str,
    query: str,
    variables: Any = None,
    operation_name: str | None = None,
) -> str:
    try:
        from pulse.native import load_native

        native = load_native()
        if hasattr(native, "graphql_ws_frame_json"):
            return native.graphql_ws_frame_json(
                "subscribe",
                id,
                query,
                json.dumps(variables) if variables is not None else None,
                operation_name,
                None,
                None,
            )
    except SystemExit:
        pass
    payload: dict[str, Any] = {"query": query}
    if variables is not None:
        payload["variables"] = variables
    if operation_name:
        payload["operationName"] = operation_name
    return json.dumps({"type": "subscribe", "id": id, "payload": payload})


def complete(id: str) -> str:
    try:
        from pulse.native import load_native

        native = load_native()
        if hasattr(native, "graphql_ws_frame_json"):
            return native.graphql_ws_frame_json("complete", id, None, None, None, None, None)
    except SystemExit:
        pass
    return json.dumps({"type": "complete", "id": id})


def pong(payload: Any = None) -> str:
    try:
        from pulse.native import load_native

        native = load_native()
        if hasattr(native, "graphql_ws_frame_json"):
            return native.graphql_ws_frame_json(
                "pong",
                None,
                None,
                None,
                None,
                json.dumps(payload) if payload is not None else None,
                None,
            )
    except SystemExit:
        pass
    body: dict[str, Any] = {"type": "pong"}
    if payload is not None:
        body["payload"] = payload
    return json.dumps(body)


def parse_frame(text: str) -> dict[str, Any] | None:
    try:
        from pulse.native import load_native

        native = load_native()
        if hasattr(native, "graphql_ws_parse_json"):
            raw = native.graphql_ws_parse_json(text)
            if raw == "null":
                return None
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                # Rust serializes `kind` as `type`
                return parsed
    except SystemExit:
        pass
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        return None
    if not isinstance(parsed, dict) or not isinstance(parsed.get("type"), str):
        return None
    return parsed
