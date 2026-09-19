"""MCP stdio protocol for Pulse (JSON-RPC, newline-delimited). No extra pip deps."""

from __future__ import annotations

import json
from contextvars import ContextVar
from pathlib import Path
from typing import Any, Callable

from .bench import compare_bench, run_bench
from .curl import curl_to_payload
from .diff import compare as diff_compare
from .envfile import load_data_rows
from .export import to_run_input
from .graphql import INTROSPECTION_QUERY, build_body as build_graphql_body, summarize_schema
from .har import har_to_pulse
from .mcp_prompts import get_prompt, list_prompts
from .mcp_resources import (
    list_resource_templates,
    list_resources,
    load_last_run,
    read_resource,
    save_last_run,
    write_collection_file,
    write_out_json,
)
from .openapi import convert as convert_openapi
from .openapi import export_spec, load_spec
from .report import summarize_run
from .schema import validate_json
from .snippet import to_curl, to_fetch
from .workspace import (
    append_history as append_agent_history,
    is_mutating_method,
    list_requests as list_workspace_requests,
    load_dotenv_secrets,
    read_request as read_workspace_request,
    workspace_root,
    write_pending,
    write_request as write_workspace_request,
)

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


def _auth_from_args(arguments: dict) -> dict:
    if isinstance(arguments.get("auth"), dict):
        return arguments["auth"]
    if arguments.get("bearerToken"):
        return {"authType": "bearer", "bearerToken": arguments["bearerToken"]}
    if arguments.get("basicUsername") is not None or arguments.get("basicPassword"):
        return {
            "authType": "basic",
            "basicUsername": arguments.get("basicUsername") or "",
            "basicPassword": arguments.get("basicPassword") or "",
        }
    return {"authType": arguments.get("authType") or "none"}


def _http_payload(arguments: dict) -> dict:
    graphql_query = arguments.get("graphqlQuery")
    introspect = bool(arguments.get("introspect"))
    body = arguments.get("body") or ""
    body_kind = arguments.get("bodyKind")
    method = str(arguments.get("method") or "").upper()
    if introspect or graphql_query:
        query = INTROSPECTION_QUERY if introspect else str(graphql_query)
        body = build_graphql_body(query, arguments.get("graphqlVariables"), arguments.get("graphqlOperationName"))
        body_kind = "graphql"
        method = method or "POST"
    payload = {
        "method": method or "GET",
        "url": str(arguments.get("url") or ""),
        "headers": _headers(arguments.get("headers")),
        "query": _headers(arguments.get("query")),
        "bodyKind": body_kind or ("json" if body else "none"),
        "body": body,
        "form": arguments.get("form") or [],
        "multipart": arguments.get("multipart") or [],
        "auth": _auth_from_args(arguments),
    }
    return payload


def tool_send(arguments: dict) -> dict:
    url = str(arguments.get("url") or "")
    if not url:
        return _text("url is required", error=True)
    method = str(arguments.get("method") or "GET")
    if is_mutating_method(method) and arguments.get("confirm") is not True:
        root = workspace_root()
        if root is not None:
            write_pending(root, {"method": method, "url": url, "source": "agent"})
        return _text(
            "Mutating method requires confirm=true. Wrote .pulse/pending for desktop approval.",
            error=True,
        )
    payload = _http_payload(arguments)
    root = workspace_root()
    if root is not None:
        secrets = load_dotenv_secrets(root)
        native = _native()
        payload["url"] = native.interpolate(payload["url"], json.dumps(secrets))
    raw = _native().send_once_json(json.dumps(payload))
    if root is not None:
        try:
            response = json.loads(raw)
        except json.JSONDecodeError:
            response = {}
        append_agent_history(
            root,
            {
                "id": f"hist_agent_{os_id()}",
                "sentAt": _now(),
                "source": "agent",
                "request": {"method": method, "url": url},
                "response": {
                    "status": response.get("status") if isinstance(response, dict) else None,
                    "elapsedMs": response.get("elapsedMs") if isinstance(response, dict) else None,
                    "sizeBytes": response.get("sizeBytes") if isinstance(response, dict) else None,
                },
            },
        )
    return _text(raw)


def tool_run_collection(arguments: dict) -> dict:
    run_input, error = _run_input_from_args(arguments)
    if error:
        return error
    methods = [
        ((item.get("request") or {}).get("method") or "GET")
        for item in (run_input or {}).get("requests") or []
    ]
    if any(is_mutating_method(str(method)) for method in methods) and arguments.get("confirm") is not True:
        root = workspace_root()
        if root is not None:
            write_pending(root, {"kind": "collection", "path": arguments.get("path"), "source": "agent"})
        return _text(
            "Collection run includes mutating methods. Pass confirm=true after desktop approval.",
            error=True,
        )
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


def tool_diff(arguments: dict) -> dict:
    left = arguments.get("a")
    right = arguments.get("b")
    if left is None:
        left = arguments.get("left")
    if right is None:
        right = arguments.get("right")
    if left is None or right is None:
        return _text("a and b are required", error=True)
    return _json(diff_compare(left, right))


def tool_export_openapi(arguments: dict) -> dict:
    payload = arguments.get("collection")
    if isinstance(payload, str):
        payload = json.loads(payload)
    if not isinstance(payload, dict):
        path = Path(arguments.get("path") or "")
        if not path.is_file():
            path = REPO_ROOT / path
        if not path.is_file():
            return _text(f"No such collection file: {arguments.get('path')}", error=True)
        payload = json.loads(path.read_text())
    spec = export_spec(payload)
    if arguments.get("inline"):
        return _json(spec)
    title = (spec.get("info") or {}).get("title") or "openapi"
    written = write_out_json(spec, arguments.get("name") or title)
    return _json({"path": str(written), "title": title, "paths": len(spec.get("paths") or {})})


def tool_graphql(arguments: dict) -> dict:
    url = str(arguments.get("url") or "")
    if not url:
        return _text("url is required", error=True)
    if not arguments.get("introspect") and not arguments.get("graphqlQuery") and not arguments.get("query"):
        return _text("graphqlQuery (or introspect=true) is required", error=True)
    payload_args = dict(arguments)
    if arguments.get("query") and not arguments.get("graphqlQuery"):
        payload_args["graphqlQuery"] = arguments["query"]
    if arguments.get("variables") is not None and arguments.get("graphqlVariables") is None:
        payload_args["graphqlVariables"] = arguments["variables"]
    raw = _native().send_once_json(json.dumps(_http_payload(payload_args)))
    try:
        response = json.loads(raw)
    except json.JSONDecodeError:
        return _text(raw)
    body = response.get("body") if isinstance(response, dict) else raw
    result: dict[str, Any] = {"http": response}
    if isinstance(body, str) and body.strip()[:1] in "{[":
        try:
            parsed = json.loads(body)
            result["graphql"] = parsed
            if arguments.get("introspect"):
                summary = summarize_schema(parsed)
                if summary:
                    result["schema"] = summary
        except json.JSONDecodeError:
            pass
    return _json(result)


def tool_curl(arguments: dict) -> dict:
    command = arguments.get("command") or arguments.get("curl") or ""
    if not str(command).strip():
        return _text("command is required", error=True)
    payload = curl_to_payload(str(command))
    if arguments.get("send"):
        return _text(_native().send_once_json(json.dumps(payload)))
    return _json(payload)


def tool_snippet(arguments: dict) -> dict:
    payload = arguments.get("request")
    if isinstance(payload, str):
        payload = json.loads(payload)
    if not isinstance(payload, dict):
        if not arguments.get("url"):
            return _text("url or request is required", error=True)
        payload = _http_payload(arguments)
    fmt = str(arguments.get("format") or "curl").lower()
    snippets = {"curl": to_curl(payload), "fetch": to_fetch(payload)}
    if fmt in snippets:
        return _text(snippets[fmt])
    return _json(snippets)


def tool_last_run(arguments: dict) -> dict:
    result = load_last_run()
    if result is None:
        return _text("No last run yet. Call pulse_run_collection first.", error=True)
    if arguments.get("full"):
        return _json(result)
    return _json(summarize_run(result))


def tool_validate_run(arguments: dict) -> dict:
    body = arguments.get("body")
    schema = arguments.get("schema")
    if body is not None and schema is not None:
        return tool_schema(arguments)

    result = arguments.get("result")
    if isinstance(result, str):
        result = json.loads(result)
    if not isinstance(result, dict):
        result = load_last_run()
    if not isinstance(result, dict):
        return _text("No last run and no result provided", error=True)

    schemas_by_name: dict[str, dict] = {}
    if arguments.get("path"):
        run_input, error = _run_input_from_args({"path": arguments["path"]})
        if error:
            return error
        for saved in (run_input or {}).get("requests") or []:
            request = saved.get("request") or {}
            name = saved.get("name") or request.get("name")
            raw = (request.get("responseSchema") or "").strip()
            if name and raw:
                schemas_by_name[str(name)] = json.loads(raw)

    reports = []
    skipped = 0
    for step in result.get("steps") or []:
        saved = step.get("saved") or {}
        name = saved.get("name")
        schema_obj = schemas_by_name.get(name) if name else None
        if schema_obj is None:
            raw = ((saved.get("request") or {}).get("responseSchema") or "").strip()
            if raw:
                schema_obj = json.loads(raw)
        if not schema_obj:
            skipped += 1
            continue
        response = step.get("response") or {}
        body_text = response.get("body")
        try:
            instance = json.loads(body_text) if isinstance(body_text, str) else body_text
        except json.JSONDecodeError:
            reports.append({"name": name, "ok": False, "errors": ["body is not JSON"]})
            continue
        errors = validate_json(instance, schema_obj)
        reports.append({"name": name, "ok": not errors, "errors": errors})
    failed = [item for item in reports if not item["ok"]]
    return _json(
        {"ok": not failed, "checked": len(reports), "skipped": skipped, "results": reports},
        error=bool(failed),
    )


def os_id() -> str:
    import time

    return str(int(time.time() * 1000))


def _now() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat()


def tool_workspace_list(_arguments: dict) -> dict:
    root = workspace_root()
    if root is None:
        return _text("PULSE_WORKSPACE is not set or is not a directory", error=True)
    try:
        return _json(list_workspace_requests(root))
    except Exception as error:
        return _text(str(error), error=True)


def tool_workspace_read(arguments: dict) -> dict:
    root = workspace_root()
    if root is None:
        return _text("PULSE_WORKSPACE is not set or is not a directory", error=True)
    item = read_workspace_request(root, str(arguments.get("id") or ""))
    if item is None:
        return _text("Request not found", error=True)
    return _json(item)


def tool_workspace_write(arguments: dict) -> dict:
    root = workspace_root()
    if root is None:
        return _text("PULSE_WORKSPACE is not set or is not a directory", error=True)
    saved = arguments.get("saved")
    if isinstance(saved, str):
        saved = json.loads(saved)
    if not isinstance(saved, dict):
        return _text("saved must be a request object", error=True)
    try:
        path = write_workspace_request(root, saved, str(arguments.get("groupName") or "collection"))
    except Exception as error:
        return _text(str(error), error=True)
    return _text(str(path))


def tool_help(_arguments: dict) -> dict:
    return _json(
        {
            "tools": [{"name": item["name"], "description": item["description"]} for item in TOOL_DEFS],
            "prompts": [{"name": item["name"], "description": item["description"]} for item in list_prompts()],
            "resources": [item["uri"] for item in list_resources()],
            "resourceTemplates": [item["uriTemplate"] for item in list_resource_templates()],
        }
    )


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
    "pulse_diff": tool_diff,
    "pulse_export_openapi": tool_export_openapi,
    "pulse_graphql": tool_graphql,
    "pulse_curl": tool_curl,
    "pulse_snippet": tool_snippet,
    "pulse_last_run": tool_last_run,
    "pulse_validate_run": tool_validate_run,
    "pulse_workspace_list": tool_workspace_list,
    "pulse_workspace_read": tool_workspace_read,
    "pulse_workspace_write": tool_workspace_write,
    "pulse_help": tool_help,
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
                "basicUsername": {"type": "string"},
                "basicPassword": {"type": "string"},
                "graphqlQuery": {"type": "string"},
                "graphqlVariables": {"description": "JSON object or string"},
                "graphqlOperationName": {"type": "string"},
                "confirm": {
                    "type": "boolean",
                    "description": "Required true for POST/PUT/PATCH/DELETE",
                },
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
                "confirm": {
                    "type": "boolean",
                    "description": "Required true when the collection includes POST/PUT/PATCH/DELETE",
                },
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
    {
        "name": "pulse_diff",
        "description": "Compare two JSON strings or objects. Returns equal/added/removed and a unified line diff.",
        "inputSchema": {
            "type": "object",
            "required": ["a", "b"],
            "properties": {
                "a": {"description": "Left JSON (string or object)"},
                "b": {"description": "Right JSON (string or object)"},
            },
        },
    },
    {
        "name": "pulse_export_openapi",
        "description": "Export a Pulse collection (workspace or v1 file) to OpenAPI 3.0. Writes python/examples/.out/ unless inline.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Path to a Pulse collection JSON"},
                "collection": {"type": "object", "description": "Inline Pulse collection instead of path"},
                "name": {"type": "string"},
                "inline": {"type": "boolean"},
            },
        },
    },
    {
        "name": "pulse_graphql",
        "description": "Send a GraphQL query (or introspect=true) through the Pulse Rust engine.",
        "inputSchema": {
            "type": "object",
            "required": ["url"],
            "properties": {
                "url": {"type": "string"},
                "graphqlQuery": {"type": "string"},
                "query": {"type": "string", "description": "Alias for graphqlQuery"},
                "graphqlVariables": {"description": "JSON object or string"},
                "variables": {"description": "Alias for graphqlVariables"},
                "graphqlOperationName": {"type": "string"},
                "introspect": {"type": "boolean"},
                "headers": {"type": "object", "additionalProperties": {"type": "string"}},
                "bearerToken": {"type": "string"},
            },
        },
    },
    {
        "name": "pulse_curl",
        "description": "Parse a cURL command into a Pulse request. Pass send=true to execute it.",
        "inputSchema": {
            "type": "object",
            "required": ["command"],
            "properties": {
                "command": {"type": "string"},
                "send": {"type": "boolean", "default": False},
            },
        },
    },
    {
        "name": "pulse_snippet",
        "description": "Generate a curl or fetch snippet from method/url/headers/body (or a Pulse request object).",
        "inputSchema": {
            "type": "object",
            "properties": {
                "format": {"type": "string", "enum": ["curl", "fetch", "all"], "default": "curl"},
                "method": {"type": "string"},
                "url": {"type": "string"},
                "headers": {"type": "object", "additionalProperties": {"type": "string"}},
                "body": {"type": "string"},
                "bodyKind": {"type": "string"},
                "bearerToken": {"type": "string"},
                "request": {"type": "object"},
            },
        },
    },
    {
        "name": "pulse_last_run",
        "description": "Return a summary of the most recent collection run (same data as pulse://last-run).",
        "inputSchema": {
            "type": "object",
            "properties": {
                "full": {"type": "boolean", "description": "Return the raw run JSON instead of the summary"},
            },
        },
    },
    {
        "name": "pulse_validate_run",
        "description": "Validate last-run (or given) response bodies against responseSchema on collection requests. Or pass body+schema like pulse_schema.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Collection JSON with responseSchema on requests"},
                "result": {"type": "object", "description": "Run result instead of last-run"},
                "body": {},
                "schema": {"type": "object"},
            },
        },
    },
    {
        "name": "pulse_workspace_list",
        "description": "List YAML requests in PULSE_WORKSPACE (Git folder).",
        "inputSchema": {"type": "object", "properties": {}},
    },
    {
        "name": "pulse_workspace_read",
        "description": "Read one YAML request from PULSE_WORKSPACE by id or relative path.",
        "inputSchema": {
            "type": "object",
            "required": ["id"],
            "properties": {"id": {"type": "string"}},
        },
    },
    {
        "name": "pulse_workspace_write",
        "description": "Write a saved request as *.pulse.yaml into PULSE_WORKSPACE.",
        "inputSchema": {
            "type": "object",
            "required": ["saved", "groupName"],
            "properties": {
                "saved": {"type": "object"},
                "groupName": {"type": "string"},
            },
        },
    },
    {
        "name": "pulse_help",
        "description": "List Pulse MCP tools, prompts, and resources so the agent does not have to guess names.",
        "inputSchema": {"type": "object", "properties": {}},
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
