#!/usr/bin/env python3
"""Generate a Schemathesis command (and optional Pulse collection) from OpenAPI."""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Contract-test an OpenAPI spec with Schemathesis, then optionally convert it for Pulse."
    )
    parser.add_argument("spec", help="OpenAPI JSON or YAML")
    parser.add_argument("--base-url", required=True, help="Target API origin, e.g. https://staging.example.com")
    parser.add_argument("--checks", default="all", help="Schemathesis checks (default: all)")
    parser.add_argument("--pulse-out", help="Also write a Pulse collection JSON via openapi_to_pulse.py")
    parser.add_argument("--dry-run", action="store_true", help="Print commands without running them")
    args = parser.parse_args()

    spec = Path(args.spec)
    st_cmd = [
        "schemathesis",
        "run",
        str(spec),
        "--url",
        args.base_url,
        "--checks",
        args.checks,
    ]
    print(" ".join(st_cmd))
    if args.pulse_out:
        converter = Path(__file__).with_name("openapi_to_pulse.py")
        pulse_cmd = [sys.executable, str(converter), str(spec), args.pulse_out]
        print(" ".join(pulse_cmd))

    if args.dry_run:
        return 0

    try:
        subprocess.run(st_cmd, check=True)
    except FileNotFoundError:
        print("schemathesis is not installed. pip install schemathesis", file=sys.stderr)
        return 1
    if args.pulse_out:
        converter = Path(__file__).with_name("openapi_to_pulse.py")
        subprocess.run([sys.executable, str(converter), str(spec), args.pulse_out], check=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
