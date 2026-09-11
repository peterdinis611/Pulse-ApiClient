"""MCP stdio protocol for Pulse (JSON-RPC, newline-delimited). No extra pip deps."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Callable

from .envfile import load_data_rows
from .export import to_run_input
from .har import har_to_pulse
from .openapi import convert as convert_openapi
from .openapi import load_spec
from .report import summarize_run
from .schema import validate_json

PROTOCOL_VERSION = "2024-11-05"
SERVER_NAME = "pulse"
SERVER_VERSION = "0.3.0"

PYTHON_ROOT = Path(__file__).resolve().parent.parent
REPO_ROOT = PYTHON_ROOT.parent


def _text(text: str, *, error: bool = False) -> dict:
    payload: dict[str, Any] = {"content": [{"type": "text", "text": text}]}
    if error:
        payload["isError"] = True
    return payload


def _json(value: object, *, error: bool = False) -> dict:
    return _text(json.dumps(value, indent=2), error=error)


def _headers(value: object) -> list[dict]:
    if not value:
        return []
    if isinstance(value, dict):
        return [{"key": str(k), "value": str(v), "enabled": True} for k, v in value.items()]
    if isinstance(value, list):
        return value
    raise ValueError("headers must be an object or a list of {key,value}")


def _env_map(env: object | None) -> dict[str, str]:
    if not env:
        return {}
    if isinstance(env, str):
        loaded = json.loads(env)
    else:
        loaded = env
    if not isinstance(loaded, dict):
        raise ValueError("env must be a JSON object")
    return {str(k): v if isinstance(v, str) else json.dumps(v) for k, v in loaded.items()}


def _native():
    from .native import load_native

    return load_native()


def tool_interpolate(arguments: dict) -> dict:
    template = arguments.get("template") or ""
    env = _env_map(arguments.get("env"))
    return _text(_native().interpolate(str(template), json.dumps(env)))


def tool_send(arguments: dict) -> dict:
    method = str(arguments.get("method") or "GET").upper()
    url = str(arguments.get("url") or "")
    if not url:
        return _text("url is required", error=True)
    payload = {
        "method": method,
        "url": url,
        "headers": _headers(arguments.get("headers")),
        "query": _headers(arguments.get("query")),
        "bodyKind": arguments.get("bodyKind") or ("json" if arguments.get("body") else "none"),
        "body": arguments.get("body") or "",
        "form": [],
        "multipart": [],
        "auth": {"authType": arguments.get("authType") or "none"},
    }
    if arguments.get("bearerToken"):
        payload["auth"] = {"authType": "bearer", "bearerToken": arguments["bearerToken"]}
    return _text(_native().send_once_json(json.dumps(payload)))


def tool_run_collection(arguments: dict) -> dict:
    path = Path(arguments.get("path") or "")
    if not path.is_file():
        path = REPO_ROOT / path
    if not path.is_file():
        return _text(f"No such collection file: {arguments.get('path')}", error=True)
    payload = json.loads(path.read_text())
    env = _env_map(arguments.get("env"))
    data_path = arguments.get("dataPath")
    data_rows = None
    if data_path:
        data_file = Path(data_path)
        if not data_file.is_file():
            data_file = REPO_ROOT / data_path
        data_rows = load_data_rows(data_file)
    run_input = to_run_input(
        payload,
        env=env or None,
        collection_id=arguments.get("collectionId"),
        data_rows=data_rows,
    )
    result = json.loads(_native().run_collection_json(json.dumps(run_input)))
    summary = arguments.get("summary")
    if summary is None or summary is True:
        return _json(summarize_run(result))
    return _json(result)


def tool_run_tests(arguments: dict) -> dict:
    script = arguments.get("script") or ""
    response = arguments.get("response")
    if isinstance(response, str):
        response = json.loads(response)
    return _text(_native().run_tests(str(script), json.dumps(response)))


def tool_openapi(arguments: dict) -> dict:
    path = Path(arguments.get("path") or "")
    if not path.is_file():
        path = REPO_ROOT / path
    if not path.is_file():
        return _text(f"No such OpenAPI file: {arguments.get('path')}", error=True)
    return _json(convert_openapi(load_spec(path)))


def tool_har(arguments: dict) -> dict:
    path = Path(arguments.get("path") or "")
    if not path.is_file():
        path = REPO_ROOT / path
    if not path.is_file():
        return _text(f"No such HAR file: {arguments.get('path')}", error=True)
    return _json(har_to_pulse(json.loads(path.read_text())))


def tool_schema(arguments: dict) -> dict:
    body = arguments.get("body")
    schema = arguments.get("schema")
    if isinstance(body, str):
        body = json.loads(body)
    if isinstance(schema, str):
        schema = json.loads(schema)
    errors = validate_json(body, schema)
    if errors:
        return _text("\n".join(errors), error=True)
    return _text("ok")


TOOLS: dict[str, Callable[[dict], dict]] = {
    "pulse_interpolate": tool_interpolate,
    "pulse_send": tool_send,
    "pulse_run_collection": tool_run_collection,
    "pulse_run_tests": tool_run_tests,
    "pulse_openapi": tool_openapi,
    "pulse_har": tool_har,
    "pulse_schema": tool_schema,
}

TOOL_DEFS = [
    {
        "name": "pulse_interpolate",
        "description": "Expand Pulse {{variables}} using the Rust interpolator.",
        "inputSchema": {
            "type": "object",
            "required": ["template"],
            "properties": {
                "template": {"type": "string"},
                "env": {"type": "object", "additionalProperties": {"type": "string"}},
            },
        },
    },
    {
        "name": "pulse_send",
        "description": "Send one HTTP request through the Pulse Rust engine (not the browser).",
        "inputSchema": {
            "type": "object",
            "required": ["url"],
            "properties": {
                "method": {"type": "string", "default": "GET"},
                "url": {"type": "string"},
                "headers": {"type": "object", "additionalProperties": {"type": "string"}},
                "query": {"type": "object", "additionalProperties": {"type": "string"}},
                "body": {"type": "string"},
                "bodyKind": {"type": "string", "enum": ["none", "json", "raw", "form", "graphql"]},
                "bearerToken": {"type": "string"},
            },
        },
    },
    {
        "name": "pulse_run_collection",
        "description": "Run a Pulse collection export or CollectionRunInput JSON file.",
        "inputSchema": {
            "type": "object",
            "required": ["path"],
            "properties": {
                "path": {"type": "string", "description": "Path to collection JSON, relative to the repo root"},
                "env": {"type": "object", "additionalProperties": {"type": "string"}},
                "dataPath": {"type": "string", "description": "Optional CSV/JSON iteration file"},
                "collectionId": {"type": "string"},
                "summary": {"type": "boolean", "default": True},
            },
        },
    },
    {
        "name": "pulse_run_tests",
        "description": "Run a Pulse/Postman test script against a saved response JSON.",
        "inputSchema": {
            "type": "object",
            "required": ["script", "response"],
            "properties": {
                "script": {"type": "string"},
                "response": {"type": "object"},
            },
        },
    },
    {
        "name": "pulse_openapi",
        "description": "Convert an OpenAPI 3 JSON/YAML spec into a Pulse collection export.",
        "inputSchema": {
            "type": "object",
            "required": ["path"],
            "properties": {"path": {"type": "string"}},
        },
    },
    {
        "name": "pulse_har",
        "description": "Convert a HAR capture into a Pulse collection export.",
        "inputSchema": {
            "type": "object",
            "required": ["path"],
            "properties": {"path": {"type": "string"}},
        },
    },
    {
        "name": "pulse_schema",
        "description": "Validate JSON against a subset JSON Schema (type, required, properties, items, enum, const).",
        "inputSchema": {
            "type": "object",
            "required": ["body", "schema"],
            "properties": {
                "body": {"type": "object"},
                "schema": {"type": "object"},
            },
        },
    },
]


def handle_message(message: dict) -> dict | None:
    method = message.get("method")
    msg_id = message.get("id")
    params = message.get("params") or {}

    if method == "initialize":
        version = params.get("protocolVersion") or PROTOCOL_VERSION
        return {
            "jsonrpc": "2.0",
            "id": msg_id,
            "result": {
                "protocolVersion": version,
                "capabilities": {"tools": {"listChanged": False}},
                "serverInfo": {"name": SERVER_NAME, "version": SERVER_VERSION},
            },
        }

    if method == "notifications/initialized" or method == "notifications/cancelled":
        return None

    if method == "ping":
        return {"jsonrpc": "2.0", "id": msg_id, "result": {}}

    if method == "tools/list":
        return {"jsonrpc": "2.0", "id": msg_id, "result": {"tools": TOOL_DEFS}}

    if method == "tools/call":
        name = params.get("name")
        arguments = params.get("arguments") or {}
        handler = TOOLS.get(name)
        if not handler:
            return {
                "jsonrpc": "2.0",
                "id": msg_id,
                "error": {"code": -32601, "message": f"Unknown tool: {name}"},
            }
        try:
            result = handler(arguments)
        except SystemExit as error:
            result = _text(str(error), error=True)
        except Exception as error:
            result = _text(f"{type(error).__name__}: {error}", error=True)
        return {"jsonrpc": "2.0", "id": msg_id, "result": result}

    if msg_id is None:
        return None
    return {
        "jsonrpc": "2.0",
        "id": msg_id,
        "error": {"code": -32601, "message": f"Unknown method: {method}"},
    }
