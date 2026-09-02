"""Pulse CLI — Python UI over the Rust engine (PyO3)."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def _load_json(value: str) -> object:
    stripped = value.strip()
    if stripped[:1] in "{[":
        return json.loads(stripped)
    path = Path(value)
    if path.is_file():
        return json.loads(path.read_text())
    return json.loads(stripped)


def _native():
    try:
        import pulse_native
    except ImportError as error:
        raise SystemExit(
            "pulse_native is not installed. From repo root run:\n"
            "  python3 -m venv .venv\n"
            "  .venv/bin/python -m pip install maturin\n"
            "  .venv/bin/python -m maturin develop --manifest-path crates/pulse-native/Cargo.toml"
        ) from error
    return pulse_native


def cmd_interpolate(args: argparse.Namespace) -> int:
    env = _load_json(args.env) if args.env else {}
    if not isinstance(env, dict):
        raise SystemExit("--env must be a JSON object or a path to one")
    print(_native().interpolate(args.template, json.dumps(env)))
    return 0


def cmd_test(args: argparse.Namespace) -> int:
    script = Path(args.script).read_text() if args.script.endswith((".js", ".pulse")) else args.script
    response = json.loads(Path(args.response).read_text())
    print(_native().run_tests(script, json.dumps(response)))
    return 0


def cmd_run(args: argparse.Namespace) -> int:
    payload = json.loads(Path(args.input).read_text())
    print(_native().run_collection_json(json.dumps(payload)))
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="pulse", description="Run Pulse collections and scripts from CI")
    sub = parser.add_subparsers(dest="command", required=True)

    interpolate = sub.add_parser("interpolate", help="Expand {{variables}} using the Rust interpolator")
    interpolate.add_argument("template")
    interpolate.add_argument("--env", help="JSON object of variables, or a path to a JSON file")
    interpolate.set_defaults(func=cmd_interpolate)

    test = sub.add_parser("test", help="Run a Pulse/Postman script against a saved response JSON")
    test.add_argument("script")
    test.add_argument("response")
    test.set_defaults(func=cmd_test)

    run = sub.add_parser("run", help="Run a collection payload (see python/README.md)")
    run.add_argument("input")
    run.set_defaults(func=cmd_run)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
