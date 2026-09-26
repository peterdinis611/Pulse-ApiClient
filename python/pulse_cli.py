"""Pulse CLI — Python UI over the Rust engine (PyO3)."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from pulse.bench import compare_bench, run_bench
from pulse.curl import curl_to_payload
from pulse.diff import compare as diff_compare
from pulse.envfile import load_data_rows, load_env
from pulse.export import is_run_input, to_run_input
from pulse.har import har_to_pulse, pulse_to_har
from pulse.junit import to_junit
from pulse.native import load_native
from pulse.openapi import convert as convert_openapi
from pulse.openapi import load_spec
from pulse.report import summarize_run
from pulse.schema import validate_json
from pulse.snippet import SNIPPET_FORMATS
from pulse._util import write_json

EXAMPLES = ROOT / "examples"
INSTALL_HINT = (
    "From repo root run:\n"
    "  bun run pulse:cli:install\n"
    "Example files: python/examples/"
)


def _require_file(value: str | None, command: str) -> Path:
    if not value:
        raise SystemExit(f"Missing path.\nExample files: python/examples/")
    path = Path(value)
    if path.is_file():
        return path
    bundled = EXAMPLES / path.name
    hint = f"\nDid you mean python/examples/{path.name}" if bundled.is_file() else ""
    raise SystemExit(
        f"No such file: {path}{hint}\n"
        f"Bundled fixtures: bun run pulse:cli {command} python/examples/{path.name or 'pets.json'}"
    )


def _load_json(value: str) -> object:
    stripped = value.strip()
    if stripped[:1] in "{[":
        return json.loads(stripped)
    path = Path(value)
    if path.is_file():
        return json.loads(path.read_text())
    return json.loads(stripped)


def _merge_env(args: argparse.Namespace) -> dict[str, str]:
    json_env = _load_json(args.env) if getattr(args, "env", None) else None
    if json_env is not None and not isinstance(json_env, dict):
        raise SystemExit("--env must be a JSON object or a path to one")
    env_file = _require_file(args.env_file, "run") if getattr(args, "env_file", None) else None
    return load_env(json_env, env_file, getattr(args, "var", None))


def _prepare_run(args: argparse.Namespace) -> dict:
    payload = json.loads(_require_file(args.input, "run").read_text())
    env = _merge_env(args)
    data_rows = load_data_rows(_require_file(args.data, "data")) if getattr(args, "data", None) else None
    if is_run_input(payload) and not env and data_rows is None:
        return payload
    return to_run_input(
        payload,
        env=env or None,
        collection_id=getattr(args, "collection_id", None),
        data_rows=data_rows,
    )


def cmd_interpolate(args: argparse.Namespace) -> int:
    env = _merge_env(args)
    print(load_native().interpolate(args.template, json.dumps(env)))
    return 0


def cmd_test(args: argparse.Namespace) -> int:
    if args.script.endswith((".js", ".pulse")):
        script = _require_file(args.script, "test").read_text()
    else:
        script = args.script
    response = json.loads(_require_file(args.response, "test").read_text())
    print(load_native().run_tests(script, json.dumps(response)))
    return 0


def cmd_run(args: argparse.Namespace) -> int:
    from pulse.mcp_resources import save_last_run

    payload = _prepare_run(args)
    result = json.loads(load_native().run_collection_json(json.dumps(payload)))
    save_last_run(result)
    if args.junit:
        out = Path(args.junit)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(to_junit(result))
    if args.summary:
        print(json.dumps(summarize_run(result), indent=2))
    else:
        print(json.dumps(result))
    failed = int(result.get("failed") or 0) + sum(1 for step in result.get("steps") or [] if step.get("error"))
    return 1 if failed else 0


def cmd_bench(args: argparse.Namespace) -> int:
    payload = _prepare_run(args)
    native = load_native()

    def once() -> dict:
        return json.loads(native.run_collection_json(json.dumps(payload)))

    report = run_bench(once, args.repeat)
    if args.out:
        write_json(Path(args.out), report)
    print(json.dumps(report["timing"], indent=2))
    baseline = json.loads(_require_file(args.baseline, "bench").read_text()) if args.baseline else None
    errors = compare_bench(report, baseline or {}, p95_budget=args.budget_p95, factor=args.factor)
    for message in errors:
        print(message, file=sys.stderr)
    return 1 if errors else 0


def cmd_junit(args: argparse.Namespace) -> int:
    result = json.loads(_require_file(args.input, "junit").read_text())
    xml = to_junit(result)
    if args.out:
        Path(args.out).write_text(xml)
    else:
        print(xml, end="")
    return 0


def cmd_report(args: argparse.Namespace) -> int:
    result = json.loads(_require_file(args.input, "report").read_text())
    print(json.dumps(summarize_run(result), indent=2))
    return 0


def cmd_schema(args: argparse.Namespace) -> int:
    instance = json.loads(_require_file(args.body, "schema").read_text())
    schema = json.loads(_require_file(args.schema, "schema").read_text())
    errors = validate_json(instance, schema)
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    print("ok")
    return 0


def cmd_har(args: argparse.Namespace) -> int:
    raw = json.loads(_require_file(args.input, "har").read_text())
    if getattr(args, "export", False) or (
        isinstance(raw, dict)
        and ("collectionGroups" in raw or "collections" in raw or "history" in raw)
        and "log" not in raw
    ):
        payload = pulse_to_har(raw)
    else:
        payload = har_to_pulse(raw)
    write_json(Path(args.out), payload) if args.out else print(json.dumps(payload, indent=2))
    return 0


def cmd_curl(args: argparse.Namespace) -> int:
    payload = curl_to_payload(args.command)
    if args.out:
        write_json(Path(args.out), payload)
    else:
        print(json.dumps(payload, indent=2))
    return 0


def cmd_diff(args: argparse.Namespace) -> int:
    left_path = Path(args.left)
    right_path = Path(args.right)
    left = json.loads(left_path.read_text()) if left_path.is_file() else _load_json(args.left)
    right = json.loads(right_path.read_text()) if right_path.is_file() else _load_json(args.right)
    report = diff_compare(left, right)
    print(report.get("diff") or json.dumps(report, indent=2))
    return 0 if report.get("equal") else 1


def cmd_snippet(args: argparse.Namespace) -> int:
    payload = json.loads(_require_file(args.input, "snippet").read_text()) if args.input else {
        "method": args.method,
        "url": args.url,
        "headers": [],
        "bodyKind": "none" if not args.body else "json",
        "body": args.body or "",
        "auth": {"authType": "none"},
    }
    fmt = (args.format or "curl").lower()
    renderer = SNIPPET_FORMATS.get(fmt)
    if renderer is None:
        raise SystemExit(f"Unknown format {fmt!r}. Choose: {', '.join(SNIPPET_FORMATS)}")
    print(renderer(payload))
    return 0


def cmd_openapi(args: argparse.Namespace) -> int:
    path = _require_file(args.spec, "openapi")
    if getattr(args, "export", False):
        from pulse.openapi import export_spec

        payload = json.loads(path.read_text())
        spec = export_spec(payload)
        write_json(Path(args.out), spec) if args.out else print(json.dumps(spec, indent=2))
        return 0
    spec = load_spec(path)
    if getattr(args, "list", False):
        ops = []
        paths = spec.get("paths") or {}
        servers = spec.get("servers") or []
        base = ""
        if isinstance(servers, list) and servers:
            base = str((servers[0] or {}).get("url") or "").rstrip("/")
        for path_key, item in paths.items():
            if not isinstance(item, dict):
                continue
            for verb, operation in item.items():
                method = str(verb).upper()
                if method not in {"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"}:
                    continue
                if not isinstance(operation, dict):
                    continue
                summary = (
                    operation.get("summary")
                    or operation.get("operationId")
                    or f"{method} {path_key}"
                )
                ops.append(
                    {
                        "method": method,
                        "path": path_key,
                        "summary": summary,
                        "url": f"{base}{path_key}",
                    }
                )
        ops.sort(key=lambda row: (row["path"], row["method"]))
        print(json.dumps(ops, indent=2))
        return 0
    payload = convert_openapi(spec)
    write_json(Path(args.out), payload) if args.out else print(json.dumps(payload, indent=2))
    return 0


def cmd_send(args: argparse.Namespace) -> int:
    native = load_native()
    if args.input:
        payload = json.loads(_require_file(args.input, "send").read_text())
    else:
        headers = []
        for item in getattr(args, "header", None) or []:
            key, _, value = item.partition(":")
            headers.append({"key": key.strip(), "value": value.strip(), "enabled": True})
        auth: dict = {"authType": "none"}
        if args.bearer:
            auth = {"authType": "bearer", "bearerToken": args.bearer}
        elif args.user:
            username, _, password = args.user.partition(":")
            auth = {"authType": "basic", "basicUsername": username, "basicPassword": password}
        body = args.body or ""
        body_kind = "none"
        if args.graphql:
            from pulse.graphql import build_body

            body = build_body(args.graphql, args.graphql_variables, args.operation)
            body_kind = "graphql"
            headers = headers or [{"key": "Content-Type", "value": "application/json", "enabled": True}]
        elif body:
            body_kind = "json" if body.strip()[:1] in "{[" else "raw"
        payload = {
            "method": args.method,
            "url": args.url,
            "headers": headers,
            "query": [],
            "bodyKind": body_kind,
            "body": body if body_kind != "graphql" else "",
            "graphqlQuery": args.graphql or "",
            "graphqlVariables": args.graphql_variables or "{}",
            "form": [],
            "multipart": [],
            "auth": auth,
        }
        if body_kind == "graphql":
            payload["body"] = body
            payload["bodyKind"] = "json"
    print(native.send_once_json(json.dumps(payload)))
    return 0


def _workspace_path(args: argparse.Namespace) -> Path:
    import os

    from pulse.workspace import workspace_root

    raw = getattr(args, "workspace", None) or os.environ.get("PULSE_WORKSPACE")
    if raw:
        path = Path(raw).expanduser().resolve()
        if not path.is_dir():
            raise SystemExit(f"No such workspace directory: {path}")
        return path
    env_root = workspace_root()
    if env_root is None:
        raise SystemExit("Set PULSE_WORKSPACE or pass --workspace")
    return env_root


def cmd_contract(args: argparse.Namespace) -> int:
    from pulse.workspace import check_workspace_files

    root = _workspace_path(args)
    native = None
    try:
        native = load_native()
    except SystemExit:
        native = None
    if native is not None and hasattr(native, "check_workspace_json"):
        report = json.loads(native.check_workspace_json(str(root)))
        errors = report.get("errors") or []
        if errors:
            print("\n".join(errors), file=sys.stderr)
            return 1
        print("ok")
        return 0
    report = check_workspace_files(root)
    errors = report.get("errors") or []
    if errors:
        print("\n".join(str(item) for item in errors), file=sys.stderr)
        return 1
    print("ok")
    return 0


def _cli_now() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat()


def cmd_workspace(args: argparse.Namespace) -> int:
    from pulse.workspace import (
        append_history,
        delete_request,
        import_openapi_requests,
        interpolate_value,
        is_mutating_method,
        list_environments,
        list_pending,
        list_requests,
        merge_variables,
        read_history,
        read_request,
        request_to_http_payload,
        search_requests,
        workspace_as_payload,
        workspace_status,
        write_pending,
        write_request,
    )

    root = _workspace_path(args)
    action = args.workspace_command
    if action == "status":
        print(json.dumps(workspace_status(root), indent=2))
        return 0
    if action == "list":
        rows = [
            {
                "id": item.get("id"),
                "name": item.get("name"),
                "method": item.get("method") or (item.get("request") or {}).get("method"),
                "url": item.get("url") or (item.get("request") or {}).get("url"),
                "filePath": item.get("filePath"),
                "groupName": item.get("groupName"),
            }
            for item in list_requests(root)
        ]
        print(json.dumps(rows, indent=2))
        return 0
    if action == "search":
        print(json.dumps(search_requests(root, args.query or ""), indent=2))
        return 0
    if action == "envs":
        print(json.dumps(list_environments(root), indent=2))
        return 0
    if action == "history":
        print(json.dumps(read_history(root, limit=int(args.limit or 20)), indent=2))
        return 0
    if action == "pending":
        print(json.dumps(list_pending(root), indent=2))
        return 0
    if action == "read":
        saved = read_request(root, args.id)
        if not saved:
            raise SystemExit(f"Request not found: {args.id}")
        print(json.dumps(saved, indent=2))
        return 0
    if action == "write":
        saved = json.loads(_require_file(args.input, "workspace").read_text())
        if not isinstance(saved, dict):
            raise SystemExit("Request JSON must be an object")
        path = write_request(root, saved, args.group or "collection")
        print(path.relative_to(root).as_posix())
        return 0
    if action == "delete":
        if not args.confirm:
            raise SystemExit("Deleting a YAML request requires --confirm")
        path = delete_request(root, args.id)
        print(json.dumps({"deleted": path.relative_to(root).as_posix()}, indent=2))
        return 0
    if action == "import-openapi":
        from pulse.openapi import convert as convert_openapi
        from pulse.openapi import load_spec

        spec_path = _require_file(args.spec, "workspace")
        payload = convert_openapi(load_spec(spec_path))
        result = import_openapi_requests(root, payload, args.collection or None)
        print(json.dumps(result, indent=2))
        return 0
    if action == "export-openapi":
        from pulse.openapi import export_spec

        spec = export_spec(workspace_as_payload(root))
        if args.out:
            write_json(Path(args.out), spec)
            print(json.dumps({"path": args.out, "paths": len(spec.get("paths") or {})}, indent=2))
        else:
            print(json.dumps(spec, indent=2))
        return 0
    if action == "send":
        saved = read_request(root, args.id)
        if not saved:
            raise SystemExit(f"Request not found: {args.id}")
        method = str(saved.get("method") or (saved.get("request") or {}).get("method") or "GET")
        url = str(saved.get("url") or (saved.get("request") or {}).get("url") or "")
        if is_mutating_method(method) and not args.confirm:
            write_pending(root, {"id": args.id, "method": method, "url": url, "source": "cli"})
            raise SystemExit(
                "Mutating method requires --confirm. Wrote .pulse/pending for desktop approval."
            )
        extra = _merge_env(args) if (
            getattr(args, "env", None) or getattr(args, "env_file", None) or getattr(args, "var", None)
        ) else {}
        variables = merge_variables(
            root,
            group_name=str(saved.get("groupName") or "") or None,
            env_name=args.env_name or None,
            extra=extra or None,
        )
        interpolated = interpolate_value(saved.get("request") or {}, variables)
        payload = request_to_http_payload(interpolated if isinstance(interpolated, dict) else {})
        native = load_native()
        raw = native.send_once_json(json.dumps(payload))
        try:
            response = json.loads(raw)
        except json.JSONDecodeError:
            response = {}
        append_history(
            root,
            {
                "id": f"hist_cli_{int(__import__('time').time() * 1000)}",
                "sentAt": _cli_now(),
                "source": "cli",
                "request": {"id": args.id, "method": payload.get("method"), "url": payload.get("url")},
                "response": {
                    "status": response.get("status") if isinstance(response, dict) else None,
                    "elapsedMs": response.get("elapsedMs") if isinstance(response, dict) else None,
                    "sizeBytes": response.get("sizeBytes") if isinstance(response, dict) else None,
                },
            },
        )
        print(raw)
        return 0
    raise SystemExit(f"Unknown workspace command: {action}")


def cmd_pre_request(args: argparse.Namespace) -> int:
    if args.script.endswith((".js", ".pulse")):
        script = _require_file(args.script, "pre-request").read_text()
    else:
        script = args.script
    env = _merge_env(args)
    print(load_native().run_pre_request(script, json.dumps(env)))
    return 0


def cmd_graphql(args: argparse.Namespace) -> int:
    from pulse.graphql import INTROSPECTION_QUERY, build_body, summarize_schema

    native = load_native()
    query = INTROSPECTION_QUERY if args.introspect else args.query
    if not query:
        raise SystemExit("Provide a GraphQL query or --introspect")
    body = build_body(query, args.variables, args.operation)
    headers = [{"key": "Content-Type", "value": "application/json", "enabled": True}]
    if args.bearer:
        headers.append({"key": "Authorization", "value": f"Bearer {args.bearer}", "enabled": True})
    payload = {
        "method": "POST",
        "url": args.url,
        "headers": headers,
        "query": [],
        "bodyKind": "json",
        "body": body,
        "form": [],
        "multipart": [],
        "auth": {"authType": "none"},
    }
    raw = native.send_once_json(json.dumps(payload))
    response = json.loads(raw)
    if args.introspect:
        summary = summarize_schema(response.get("body") or "{}")
        print(json.dumps(summary or response, indent=2))
    else:
        print(json.dumps(response, indent=2))
    return 0


def cmd_mock(args: argparse.Namespace) -> int:
    native = load_native()
    if args.mock_command == "stop":
        if not hasattr(native, "mock_stop"):
            raise SystemExit("pulse_native is outdated (missing mock_stop). Rebuild: bun run pulse:cli:install")
        native.mock_stop()
        print("ok")
        return 0
    if not hasattr(native, "mock_start_json"):
        raise SystemExit("pulse_native is outdated (missing mock_start_json). Rebuild: bun run pulse:cli:install")
    import os

    workspace = args.workspace or os.environ.get("PULSE_WORKSPACE")
    routes_json = None
    if args.routes:
        routes_json = _require_file(args.routes, "mock").read_text()
    handle = native.mock_start_json(routes_json, int(args.delay_ms or 0), workspace)
    print(handle if isinstance(handle, str) else json.dumps(handle, indent=2))
    return 0


def cmd_env(args: argparse.Namespace) -> int:
    env = _merge_env(args)
    if args.format == "dotenv":
        for key, value in sorted(env.items()):
            needs_quote = any(ch in value for ch in ' \t#"\'') or value == ""
            if needs_quote:
                escaped = value.replace("\\", "\\\\").replace('"', '\\"')
                print(f'{key}="{escaped}"')
            else:
                print(f"{key}={value}")
        return 0
    print(json.dumps(env, indent=2))
    return 0


def cmd_last_run(args: argparse.Namespace) -> int:
    from pulse.mcp_resources import load_last_run

    result = load_last_run()
    if result is None:
        raise SystemExit("No last run yet. Call `pulse run` (or MCP pulse_run_collection) first.")
    if args.full:
        print(json.dumps(result, indent=2))
    else:
        print(json.dumps(summarize_run(result), indent=2))
    return 0


def cmd_validate_run(args: argparse.Namespace) -> int:
    from pulse.mcp_resources import load_last_run

    result = json.loads(_require_file(args.input, "validate-run").read_text()) if args.input else load_last_run()
    if not isinstance(result, dict):
        raise SystemExit("No last run and no --input provided")
    schemas_by_name: dict[str, dict] = {}
    if args.collection:
        run_input = to_run_input(json.loads(_require_file(args.collection, "validate-run").read_text()))
        for saved in run_input.get("requests") or []:
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
    print(json.dumps({"ok": not failed, "checked": len(reports), "skipped": skipped, "results": reports}, indent=2))
    return 1 if failed else 0


def cmd_help(_args: argparse.Namespace) -> int:
    lines = [
        "pulse CLI — same engine as MCP (pulse_native)",
        "",
        "Core:        interpolate · test · pre-request · run · bench · send · graphql",
        "Convert:     openapi [--list|--export] · har [--export] · curl · snippet · diff · schema",
        "CI:          junit · report · validate-run · last-run · contract · env",
        "Workspace:   workspace status|list|search|envs|history|pending|read|write|delete|send|import-openapi|export-openapi",
        "Local mock:  mock start|stop",
        "Meta:        version · doctor · help",
        "",
        "Env: PULSE_WORKSPACE=/path/to/git-folder",
        "Install: bun run pulse:cli:install",
        "Examples: python/examples/",
    ]
    print("\n".join(lines))
    return 0


def cmd_version(_args: argparse.Namespace) -> int:
    print("pulse-cli 2.1.0")
    print(f"python {sys.version.split()[0]}")
    try:
        native = load_native()
        features = sorted(
            name
            for name in (
                "send_once_json",
                "run_collection_json",
                "run_tests",
                "run_pre_request",
                "interpolate",
                "load_workspace_json",
                "check_workspace_json",
                "mock_start_json",
                "mock_stop",
            )
            if hasattr(native, name)
        )
        print(f"pulse_native ok ({', '.join(features)})")
    except SystemExit as error:
        print(f"pulse_native missing: {error}")
        return 1
    return 0


def cmd_doctor(_args: argparse.Namespace) -> int:
    import os

    from pulse.workspace import workspace_root

    code = cmd_version(_args)
    root = workspace_root()
    print(f"PULSE_WORKSPACE={root or os.environ.get('PULSE_WORKSPACE') or '(unset)'}")
    print(f"examples={EXAMPLES if EXAMPLES.is_dir() else 'missing'}")
    return code


def _add_env_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--env", help="JSON object of variables, or a path to a JSON file")
    parser.add_argument("--env-file", help=".env or JSON file of variables")
    parser.add_argument("--var", action="append", default=[], help="key=value overlay (repeatable)")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="pulse", description="Run Pulse collections and scripts from CI")
    sub = parser.add_subparsers(dest="command", required=True)

    interpolate = sub.add_parser("interpolate", help="Expand {{variables}} using the Rust interpolator")
    interpolate.add_argument("template")
    _add_env_args(interpolate)
    interpolate.set_defaults(func=cmd_interpolate)

    test = sub.add_parser("test", help="Run a Pulse/Postman script against a saved response JSON")
    test.add_argument("script")
    test.add_argument("response")
    test.set_defaults(func=cmd_test)

    pre = sub.add_parser("pre-request", help="Run a pre-request script and print environment mutations")
    pre.add_argument("script")
    _add_env_args(pre)
    pre.set_defaults(func=cmd_pre_request)

    run = sub.add_parser("run", help="Run a Pulse export or CollectionRunInput JSON")
    run.add_argument("input")
    _add_env_args(run)
    run.add_argument("--collection-id", help="Collection id when the file has several groups")
    run.add_argument("--data", help="CSV or JSON array of iteration rows")
    run.add_argument("--junit", help="Write JUnit XML to this path")
    run.add_argument("--summary", action="store_true", help="Print timing summary instead of the full result")
    run.set_defaults(func=cmd_run)

    bench = sub.add_parser("bench", help="Repeat a collection run and check p95 against a budget")
    bench.add_argument("input")
    _add_env_args(bench)
    bench.add_argument("--collection-id")
    bench.add_argument("--data")
    bench.add_argument("--repeat", type=int, default=5)
    bench.add_argument("--budget-p95", type=float, help="Fail if p95 ms is above this")
    bench.add_argument("--baseline", help="Previous bench JSON to compare against")
    bench.add_argument("--factor", type=float, default=1.2, help="Allowed p95 / baseline ratio (default 1.2)")
    bench.add_argument("--out", help="Write the full bench report JSON")
    bench.set_defaults(func=cmd_bench)

    junit = sub.add_parser("junit", help="Convert a collection run result JSON to JUnit XML")
    junit.add_argument("input")
    junit.add_argument("--out")
    junit.set_defaults(func=cmd_junit)

    report = sub.add_parser("report", help="Timing / failure summary from a collection run result JSON")
    report.add_argument("input")
    report.set_defaults(func=cmd_report)

    schema = sub.add_parser("schema", help="Validate a JSON body against a (subset) JSON Schema")
    schema.add_argument("body")
    schema.add_argument("schema")
    schema.set_defaults(func=cmd_schema)

    har = sub.add_parser("har", help="HAR ↔ Pulse: import a capture, or --export a Pulse dump / history")
    har.add_argument("input")
    har.add_argument("--out")
    har.add_argument(
        "--export",
        action="store_true",
        help="Write HAR from a Pulse collection/history JSON (default auto-detects)",
    )
    har.set_defaults(func=cmd_har)

    curl = sub.add_parser("curl", help="Parse a cURL command into a Pulse HTTP payload JSON")
    curl.add_argument("command", help="Full curl command (quote the whole string)")
    curl.add_argument("--out")
    curl.set_defaults(func=cmd_curl)

    diff = sub.add_parser("diff", help="Unified diff between two JSON values or files")
    diff.add_argument("left")
    diff.add_argument("right")
    diff.set_defaults(func=cmd_diff)

    snippet = sub.add_parser(
        "snippet",
        help="Generate curl/fetch/httpie/python/axios/okhttp/reqwest/swift from a request",
    )
    snippet.add_argument("--input", help="HttpRequestPayload JSON file")
    snippet.add_argument("--url")
    snippet.add_argument("--method", default="GET")
    snippet.add_argument("--body")
    snippet.add_argument(
        "--format",
        default="curl",
        choices=sorted(SNIPPET_FORMATS),
        help="Snippet language (default curl)",
    )
    snippet.set_defaults(func=cmd_snippet)

    openapi = sub.add_parser("openapi", help="OpenAPI → Pulse, --list operations, or --export Pulse → OpenAPI")
    openapi.add_argument("spec", help="OpenAPI file, or Pulse JSON when using --export")
    openapi.add_argument("--out")
    openapi.add_argument("--list", action="store_true", help="List operations instead of converting")
    openapi.add_argument("--export", action="store_true", help="Export a Pulse collection dump as OpenAPI 3.0")
    openapi.set_defaults(func=cmd_openapi)

    send = sub.add_parser("send", help="Send one HTTP (or GraphQL) request through the Rust engine")
    send.add_argument("--url")
    send.add_argument("--method", default="GET")
    send.add_argument("--body")
    send.add_argument("--header", action="append", default=[], help="Header: value (repeatable)")
    send.add_argument("--bearer", help="Bearer token")
    send.add_argument("--user", help="basic user:password")
    send.add_argument("--graphql", help="GraphQL query string")
    send.add_argument("--graphql-variables", default="{}", help="GraphQL variables JSON")
    send.add_argument("--operation", help="GraphQL operationName")
    send.add_argument("--input", help="HttpRequestPayload JSON file")
    send.set_defaults(func=cmd_send)

    graphql = sub.add_parser("graphql", help="POST a GraphQL query (or --introspect) through the Rust engine")
    graphql.add_argument("--url", required=True)
    graphql.add_argument("--query", help="GraphQL query document")
    graphql.add_argument("--variables", default="{}", help="Variables JSON object")
    graphql.add_argument("--operation", help="operationName")
    graphql.add_argument("--bearer")
    graphql.add_argument("--introspect", action="store_true", help="Run built-in introspection and summarize")
    graphql.set_defaults(func=cmd_graphql)

    contract = sub.add_parser("contract", help="Validate YAML workspace examples against responseSchema / snapshots")
    contract.add_argument(
        "workspace",
        nargs="?",
        default=None,
        help="Git workspace root (default: PULSE_WORKSPACE)",
    )
    contract.set_defaults(func=cmd_contract)

    workspace = sub.add_parser("workspace", help="Inspect or send from a Git YAML workspace")
    workspace.add_argument(
        "--workspace",
        help="Workspace root (default: PULSE_WORKSPACE)",
    )
    ws_sub = workspace.add_subparsers(dest="workspace_command", required=True)

    for name, help_text in (
        ("status", "Counts, envs, pending, secret key names"),
        ("list", "List saved requests"),
        ("envs", "List environments"),
        ("pending", "List mutating calls waiting in .pulse/pending"),
    ):
        p = ws_sub.add_parser(name, help=help_text)
        p.set_defaults(func=cmd_workspace)

    ws_search = ws_sub.add_parser("search", help="Search requests by id/name/method/url")
    ws_search.add_argument("query", nargs="?", default="")
    ws_search.set_defaults(func=cmd_workspace)

    ws_history = ws_sub.add_parser("history", help="Read .pulse/history.jsonl")
    ws_history.add_argument("--limit", type=int, default=20)
    ws_history.set_defaults(func=cmd_workspace)

    ws_read = ws_sub.add_parser("read", help="Read one request by id/name/path")
    ws_read.add_argument("id")
    ws_read.set_defaults(func=cmd_workspace)

    ws_write = ws_sub.add_parser("write", help="Write a request JSON as *.pulse.yaml")
    ws_write.add_argument("input", help="Saved request JSON file")
    ws_write.add_argument("--group", default="collection", help="collections/<group>/ folder name")
    ws_write.set_defaults(func=cmd_workspace)

    ws_delete = ws_sub.add_parser("delete", help="Delete a YAML request")
    ws_delete.add_argument("id")
    ws_delete.add_argument("--confirm", action="store_true", help="Required to delete")
    ws_delete.set_defaults(func=cmd_workspace)

    ws_import = ws_sub.add_parser("import-openapi", help="Convert OpenAPI into collections/*.pulse.yaml")
    ws_import.add_argument("spec")
    ws_import.add_argument("--collection", help="Target collection folder name")
    ws_import.set_defaults(func=cmd_workspace)

    ws_export = ws_sub.add_parser("export-openapi", help="Export the Git workspace as OpenAPI 3.0")
    ws_export.add_argument("--out", help="Write OpenAPI JSON to this path")
    ws_export.set_defaults(func=cmd_workspace)

    ws_send = ws_sub.add_parser("send", help="Send a saved YAML request")
    ws_send.add_argument("id")
    ws_send.add_argument("--env-name", help="Environment name or id")
    ws_send.add_argument("--confirm", action="store_true", help="Required for POST/PUT/PATCH/DELETE")
    _add_env_args(ws_send)
    ws_send.set_defaults(func=cmd_workspace)

    mock = sub.add_parser("mock", help="Start/stop the local mock on 127.0.0.1:4010")
    mock_sub = mock.add_subparsers(dest="mock_command", required=True)
    mock_start = mock_sub.add_parser("start", help="Serve saved examples from a workspace or routes JSON")
    mock_start.add_argument("--workspace", help="Git workspace root (default PULSE_WORKSPACE)")
    mock_start.add_argument("--routes", help="MockRoute[] JSON file")
    mock_start.add_argument("--delay-ms", type=int, default=0)
    mock_start.set_defaults(func=cmd_mock)
    mock_stop = mock_sub.add_parser("stop", help="Stop the mock started by this CLI process tree")
    mock_stop.set_defaults(func=cmd_mock)

    env_cmd = sub.add_parser("env", help="Merge --env / --env-file / --var and print the result")
    _add_env_args(env_cmd)
    env_cmd.add_argument("--format", choices=["json", "dotenv"], default="json")
    env_cmd.set_defaults(func=cmd_env)

    last_run = sub.add_parser("last-run", help="Print the last collection run summary (or --full)")
    last_run.add_argument("--full", action="store_true")
    last_run.set_defaults(func=cmd_last_run)

    validate_run = sub.add_parser("validate-run", help="Validate last-run (or --input) bodies against responseSchema")
    validate_run.add_argument("--input", help="Collection run result JSON (default: last run)")
    validate_run.add_argument("--collection", help="Optional collection export for responseSchema lookup")
    validate_run.set_defaults(func=cmd_validate_run)

    help_cmd = sub.add_parser("help", help="Short command map (MCP parity overview)")
    help_cmd.set_defaults(func=cmd_help)

    version = sub.add_parser("version", help="Print CLI / Python / pulse_native feature versions")
    version.set_defaults(func=cmd_version)

    doctor = sub.add_parser("doctor", help="version + workspace/examples sanity check")
    doctor.set_defaults(func=cmd_doctor)

    args = parser.parse_args(argv)
    if args.command == "send" and not args.input and not args.url:
        send.error("provide --url or --input")
    if args.command == "snippet" and not args.input and not args.url:
        snippet.error("provide --url or --input")
    if args.command == "graphql" and not args.introspect and not args.query:
        graphql.error("provide --query or --introspect")
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
