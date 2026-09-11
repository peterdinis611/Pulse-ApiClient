"""MCP stdio protocol for Pulse (JSON-RPC, newline-delimited). No extra pip deps."""

from __future__ import annotations

import json
from contextvars import ContextVar
from pathlib import Path
from typing import Any, Callable

from .bench import compare_bench, run_bench
from .envfile import load_data_rows
from .export import to_run_input
from .har import har_to_pulse
from .mcp_prompts import get_prompt, list_prompts
from .mcp_resources import (
    list_resource_templates,
    list_resources,
    read_resource,
    save_last_run,
    write_collection_file,
)
from .openapi import convert as convert_openapi
from .openapi import load_spec
from .report import summarize_run
from .schema import validate_json

PROTOCOL_VERSION = "2024-11-05"
SERVER_NAME = "pulse"
SERVER_VERSION = "0.3.0"

PYTHON_ROOT = Path(__file__).resolve().parent.parent
REPO_ROOT = PYTHON_ROOT.parent

Notify = Callable[[dict], None]
_notify: ContextVar[Notify | None] = ContextVar("pulse_mcp_notify", default=None)
_progress_token: ContextVar[object | None] = ContextVar("pulse_mcp_progress_token", default=None)


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


def emit_step(event: dict) -> None:
    notify = _notify.get()
    if notify is None:
        return
    index = int(event.get("index") or 0)
    total = int(event.get("total") or 0)
    name = str(event.get("name") or "")
    status = str(event.get("status") or "")
    ms = event.get("ms")
    message = name
    if status:
        message = f"{name} {status}".strip()
    if ms is not None and ms != "":
        message = f"{message} {ms}ms".strip()
    token = _progress_token.get()
    if token is not None:
        progress: dict[str, Any] = {
            "progressToken": token,
            "progress": index,
            "message": message,
        }
        if total:
            progress["total"] = total
        notify({"jsonrpc": "2.0", "method": "notifications/progress", "params": progress})
    notify(
        {
            "jsonrpc": "2.0",
            "method": "notifications/pulse/step",
            "params": {
                "name": name,
                "status": status,
                "ms": ms,
                "index": index,
                "total": total,
                "error": event.get("error"),
                "failed": event.get("failed") or 0,
            },
        }
    )


def _on_native_progress(event_json: str) -> None:
    try:
        emit_step(json.loads(event_json))
    except Exception:
        return


def _run_collection_json(run_input: dict) -> dict:
    native = _native()
    payload = json.dumps(run_input)
    try:
        raw = native.run_collection_json(payload, _on_native_progress)
    except TypeError:
        raw = native.run_collection_json(payload)
    return json.loads(raw)


def _run_input_from_args(arguments: dict) -> tuple[dict | None, dict | None]:
    path = Path(arguments.get("path") or "")
    if not path.is_file():
        path = REPO_ROOT / path
    if not path.is_file():
        return None, _text(f"No such collection file: {arguments.get('path')}", error=True)
    payload = json.loads(path.read_text())
    env = _env_map(arguments.get("env"))
    data_path = arguments.get("dataPath")
    data_rows = None
    if data_path:
        data_file = Path(data_path)
        if not data_file.is_file():
            data_file = REPO_ROOT / data_path
        data_rows = load_data_rows(data_file)
    return (
        to_run_input(
            payload,
            env=env or None,
            collection_id=arguments.get("collectionId"),
            data_rows=data_rows,
        ),
        None,
    )


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
    run_input, error = _run_input_from_args(arguments)
    if error:
        return error
    result = _run_collection_json(run_input or {})
    save_last_run(result)
    summary = arguments.get("summary")
    if summary is None or summary is True:
        return _json(summarize_run(result))
    return _json(result)


def tool_bench(arguments: dict) -> dict:
    run_input, error = _run_input_from_args(arguments)
    if error:
        return error
    repeats = int(arguments.get("repeats") or 5)
    factor = float(arguments.get("factor") or 1.2)
    budget = arguments.get("p95Budget")
    if budget is None:
        budget = arguments.get("budgetP95")
    p95_budget = float(budget) if budget is not None else None
    baseline_arg = arguments.get("baseline")
    baseline: dict = {}
    if isinstance(baseline_arg, dict):
        baseline = baseline_arg
    elif baseline_arg:
        baseline_path = Path(str(baseline_arg))
        if not baseline_path.is_file():
            baseline_path = REPO_ROOT / str(baseline_arg)
        if not baseline_path.is_file():
            return _text(f"No such baseline file: {baseline_arg}", error=True)
        loaded = json.loads(baseline_path.read_text())
        if not isinstance(loaded, dict):
            return _text("baseline must be a JSON object", error=True)
        baseline = loaded

    payload = run_input or {}

    def once() -> dict:
        return _run_collection_json(payload)

    def on_repeat(index: int, total: int, summary: dict) -> None:
        emit_step(
            {
                "index": index,
                "total": total,
                "name": f"bench {index}/{total}",
                "status": "fail" if (summary.get("failed") or summary.get("httpErrors")) else "ok",
                "ms": (summary.get("timing") or {}).get("p95Ms"),
                "failed": summary.get("failed") or 0,
            }
        )

    report = run_bench(once, repeats, on_repeat=on_repeat)
    errors = compare_bench(report, baseline, p95_budget=p95_budget, factor=factor)
    body = {**report, "ok": not errors, "errors": errors}
    return _json(body, error=bool(errors))


def tool_run_tests(arguments: dict) -> dict:
    script = arguments.get("script") or ""
    response = arguments.get("response")
    if isinstance(response, str):
        response = json.loads(response)
    return _text(_native().run_tests(str(script), json.dumps(response)))


def _written(payload: dict, name: str | None) -> dict:
    path = write_collection_file(payload, name)
    groups = payload.get("collectionGroups") or []
    return _json(
        {
            "path": str(path),
            "name": (groups[0] or {}).get("name") if groups else Path(path).stem,
            "requests": len(payload.get("collections") or []),
        }
    )


def tool_openapi(arguments: dict) -> dict:
    path = Path(arguments.get("path") or "")
    if not path.is_file():
        path = REPO_ROOT / path
    if not path.is_file():
        return _text(f"No such OpenAPI file: {arguments.get('path')}", error=True)
    payload = convert_openapi(load_spec(path))
    if arguments.get("inline"):
        return _json(payload)
    return _written(payload, arguments.get("name") or path.stem)


def tool_har(arguments: dict) -> dict:
    path = Path(arguments.get("path") or "")
    if not path.is_file():
        path = REPO_ROOT / path
    if not path.is_file():
        return _text(f"No such HAR file: {arguments.get('path')}", error=True)
    payload = har_to_pulse(json.loads(path.read_text()))
    if arguments.get("inline"):
        return _json(payload)
    return _written(payload, arguments.get("name") or path.stem)


def tool_write_collection(arguments: dict) -> dict:
    payload = arguments.get("collection")
    if isinstance(payload, str):
        payload = json.loads(payload)
    if not isinstance(payload, dict):
        return _text("collection must be a Pulse export JSON object", error=True)
    return _written(payload, arguments.get("name"))


def tool_pre_request(arguments: dict) -> dict:
    script = arguments.get("script") or ""
    env = _env_map(arguments.get("env"))
    return _text(_native().run_pre_request(str(script), json.dumps(env)))


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
    "pulse_bench": tool_bench,
    "pulse_run_tests": tool_run_tests,
    "pulse_openapi": tool_openapi,
    "pulse_har": tool_har,
    "pulse_write_collection": tool_write_collection,
    "pulse_pre_request": tool_pre_request,
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
        "name": "pulse_bench",
        "description": "Repeat a collection run and check p95 against a budget or baseline (did it get slower?).",
        "inputSchema": {
            "type": "object",
            "required": ["path"],
            "properties": {
                "path": {"type": "string", "description": "Path to collection JSON, relative to the repo root"},
                "env": {"type": "object", "additionalProperties": {"type": "string"}},
                "dataPath": {"type": "string"},
                "collectionId": {"type": "string"},
                "repeats": {"type": "integer", "default": 5, "minimum": 1},
                "p95Budget": {"type": "number", "description": "Fail if p95 ms exceeds this budget"},
                "baseline": {
                    "description": "Path to a previous bench JSON, or the JSON object itself",
                },
                "factor": {"type": "number", "default": 1.2, "description": "Allowed p95 multiplier vs baseline when p95Budget is omitted"},
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
        "description": "Convert OpenAPI 3 into a Pulse collection file (python/examples/.out/).",
        "inputSchema": {
            "type": "object",
            "required": ["path"],
            "properties": {
                "path": {"type": "string"},
                "name": {"type": "string", "description": "Output filename stem under python/examples/.out/"},
                "inline": {"type": "boolean", "description": "Return the collection JSON instead of writing a file"},
            },
        },
    },
    {
        "name": "pulse_har",
        "description": "Convert a HAR capture into a Pulse collection file (python/examples/.out/).",
        "inputSchema": {
            "type": "object",
            "required": ["path"],
            "properties": {
                "path": {"type": "string"},
                "name": {"type": "string"},
                "inline": {"type": "boolean"},
            },
        },
    },
    {
        "name": "pulse_write_collection",
        "description": "Write a Pulse collection JSON to python/examples/.out/ and return the path.",
        "inputSchema": {
            "type": "object",
            "required": ["collection"],
            "properties": {
                "collection": {"type": "object"},
                "name": {"type": "string"},
            },
        },
    },
    {
        "name": "pulse_pre_request",
        "description": "Run a Pulse pre-request script and return environment mutations.",
        "inputSchema": {
            "type": "object",
            "required": ["script"],
            "properties": {
                "script": {"type": "string"},
                "env": {"type": "object", "additionalProperties": {"type": "string"}},
            },
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


def handle_message(message: dict, notify: Notify | None = None) -> dict | None:
    method = message.get("method")
    msg_id = message.get("id")
    params = message.get("params") or {}
    meta = params.get("_meta") if isinstance(params, dict) else None
    if not isinstance(meta, dict):
        top = message.get("_meta")
        meta = top if isinstance(top, dict) else None
    token = meta.get("progressToken") if isinstance(meta, dict) else None
    notify_token = _notify.set(notify)
    progress_reset = _progress_token.set(token)
    try:
        return _dispatch(method, msg_id, params)
    finally:
        _notify.reset(notify_token)
        _progress_token.reset(progress_reset)


def _dispatch(method: object, msg_id: object, params: dict) -> dict | None:
    if method == "initialize":
        version = params.get("protocolVersion") or PROTOCOL_VERSION
        return {
            "jsonrpc": "2.0",
            "id": msg_id,
            "result": {
                "protocolVersion": version,
                "capabilities": {
                    "tools": {"listChanged": False},
                    "resources": {"subscribe": False, "listChanged": False},
                    "prompts": {"listChanged": False},
                },
                "serverInfo": {"name": SERVER_NAME, "version": SERVER_VERSION},
            },
        }

    if method == "notifications/initialized" or method == "notifications/cancelled":
        return None

    if method == "ping":
        return {"jsonrpc": "2.0", "id": msg_id, "result": {}}

    if method == "tools/list":
        return {"jsonrpc": "2.0", "id": msg_id, "result": {"tools": TOOL_DEFS}}

    if method == "prompts/list":
        return {"jsonrpc": "2.0", "id": msg_id, "result": {"prompts": list_prompts()}}

    if method == "prompts/get":
        name = params.get("name") or ""
        prompt = get_prompt(str(name), params.get("arguments") or {})
        if prompt is None:
            return {
                "jsonrpc": "2.0",
                "id": msg_id,
                "error": {"code": -32602, "message": f"Unknown prompt: {name}"},
            }
        return {"jsonrpc": "2.0", "id": msg_id, "result": prompt}

    if method == "resources/list":
        return {"jsonrpc": "2.0", "id": msg_id, "result": {"resources": list_resources()}}

    if method == "resources/templates/list":
        return {"jsonrpc": "2.0", "id": msg_id, "result": {"resourceTemplates": list_resource_templates()}}

    if method == "resources/read":
        uri = params.get("uri") or ""
        contents = read_resource(uri)
        if contents is None:
            return {
                "jsonrpc": "2.0",
                "id": msg_id,
                "error": {"code": -32002, "message": f"Resource not found: {uri}"},
            }
        return {"jsonrpc": "2.0", "id": msg_id, "result": contents}

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
