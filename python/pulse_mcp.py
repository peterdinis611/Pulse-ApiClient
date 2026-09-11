#!/usr/bin/env python3
"""Pulse MCP server — stdio JSON-RPC for Cursor / Claude Desktop."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from pulse.mcp_protocol import handle_message


def _read() -> dict | None:
    line = sys.stdin.readline()
    if not line:
        return None
    if line.lower().startswith("content-length:"):
        length = int(line.split(":", 1)[1].strip())
        while True:
            header = sys.stdin.readline()
            if header in ("\r\n", "\n", ""):
                break
        body = sys.stdin.read(length)
        return json.loads(body)
    return json.loads(line)


def _write(message: dict) -> None:
    sys.stdout.write(json.dumps(message, separators=(",", ":")) + "\n")
    sys.stdout.flush()


def main() -> int:
    while True:
        try:
            incoming = _read()
        except json.JSONDecodeError as error:
            print(f"pulse mcp: invalid JSON ({error})", file=sys.stderr)
            continue
        if incoming is None:
            return 0
        try:
            outgoing = handle_message(incoming)
        except Exception as error:
            msg_id = incoming.get("id") if isinstance(incoming, dict) else None
            if msg_id is None:
                print(f"pulse mcp: {error}", file=sys.stderr)
                continue
            outgoing = {
                "jsonrpc": "2.0",
                "id": msg_id,
                "error": {"code": -32603, "message": str(error)},
            }
        if outgoing is not None:
            _write(outgoing)


if __name__ == "__main__":
    raise SystemExit(main())
