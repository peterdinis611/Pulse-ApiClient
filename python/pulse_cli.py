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
from pulse.envfile import load_data_rows, load_env
from pulse.export import is_run_input, to_run_input
from pulse.har import har_to_pulse
from pulse.junit import to_junit
from pulse.native import load_native
from pulse.openapi import convert as convert_openapi
from pulse.openapi import load_spec
from pulse.report import summarize_run
from pulse.schema import validate_json
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
    payload = _prepare_run(args)
    result = json.loads(load_native().run_collection_json(json.dumps(payload)))
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
    har = json.loads(_require_file(args.input, "har").read_text())
    payload = har_to_pulse(har)
    write_json(Path(args.out), payload) if args.out else print(json.dumps(payload, indent=2))
    return 0


def cmd_openapi(args: argparse.Namespace) -> int:
    payload = convert_openapi(load_spec(_require_file(args.spec, "openapi")))
    write_json(Path(args.out), payload) if args.out else print(json.dumps(payload, indent=2))
    return 0


def cmd_send(args: argparse.Namespace) -> int:
    native = load_native()
    if not hasattr(native, "send_once_json"):
        raise SystemExit(
            "pulse_native is outdated (missing send_once_json).\n"
            "Rebuild with: bun run pulse:cli:install"
        )
    payload = json.loads(_require_file(args.input, "send").read_text()) if args.input else {
        "method": args.method,
        "url": args.url,
        "headers": [],
        "query": [],
        "bodyKind": "none" if not args.body else "json",
        "body": args.body or "",
        "form": [],
        "multipart": [],
        "auth": {"authType": "none"},
    }
    print(native.send_once_json(json.dumps(payload)))
    return 0


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

    har = sub.add_parser("har", help="Convert a HAR capture into a Pulse collection export")
    har.add_argument("input")
    har.add_argument("--out")
    har.set_defaults(func=cmd_har)

    openapi = sub.add_parser("openapi", help="Convert OpenAPI 3 into a Pulse collection export")
    openapi.add_argument("spec")
    openapi.add_argument("--out")
    openapi.set_defaults(func=cmd_openapi)

    send = sub.add_parser("send", help="Send one HTTP request through the Rust engine")
    send.add_argument("--url")
    send.add_argument("--method", default="GET")
    send.add_argument("--body")
    send.add_argument("--input", help="HttpRequestPayload JSON file")
    send.set_defaults(func=cmd_send)

    args = parser.parse_args(argv)
    if args.command == "send" and not args.input and not args.url:
        send.error("provide --url or --input")
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
