"""SSE parse + stream collect (Rust parser via pulse_native when available)."""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any, Iterator


def parse_block(block: str) -> dict[str, Any] | None:
    """Parse one SSE event block. Prefers pulse_native.parse_sse_json."""
    try:
        from pulse.native import load_native

        native = load_native()
        if hasattr(native, "parse_sse_json"):
            # Feed as a completed document with trailing delimiter.
            events = json.loads(native.parse_sse_json(block if block.endswith("\n\n") else block + "\n\n"))
            if isinstance(events, list) and events:
                return events[0]
            return None
    except SystemExit:
        pass
    return _parse_block_py(block)


def parse_text(text: str) -> list[dict[str, Any]]:
    try:
        from pulse.native import load_native

        native = load_native()
        if hasattr(native, "parse_sse_json"):
            events = json.loads(native.parse_sse_json(text))
            return events if isinstance(events, list) else []
    except SystemExit:
        pass
    return list(_iter_events_py(text))


def _parse_block_py(block: str) -> dict[str, Any] | None:
    event = None
    event_id = None
    retry_ms = None
    data_lines: list[str] = []
    for raw in block.split("\n"):
        line = raw[:-1] if raw.endswith("\r") else raw
        if not line or line.startswith(":"):
            continue
        if ":" in line:
            field, rest = line.split(":", 1)
            value = rest[1:] if rest.startswith(" ") else rest
        else:
            field, value = line, ""
        if field == "event" and value:
            event = value
        elif field == "data":
            data_lines.append(value)
        elif field == "id":
            if "\0" in value:
                continue
            event_id = None if value == "" else value
        elif field == "retry" and value.isdigit():
            retry_ms = int(value)
    if not data_lines and event_id is None and retry_ms is None:
        return None
    out: dict[str, Any] = {"data": "\n".join(data_lines)}
    if data_lines and event is not None:
        out["event"] = event
    if event_id is not None:
        out["id"] = event_id
    if retry_ms is not None:
        out["retryMs"] = retry_ms
    return out


def _iter_events_py(text: str) -> Iterator[dict[str, Any]]:
    parts = text.replace("\r\n\r\n", "\n\n").split("\n\n")
    for part in parts:
        parsed = _parse_block_py(part)
        if parsed:
            yield parsed


def collect(
    url: str,
    *,
    method: str = "GET",
    headers: dict[str, str] | None = None,
    body: str | None = None,
    max_events: int = 50,
    timeout_s: float = 30.0,
    last_event_id: str | None = None,
) -> list[dict[str, Any]]:
    """Open an HTTP SSE stream and collect up to max_events (stdlib urllib)."""
    req_headers = {
        "Accept": "text/event-stream",
        "Cache-Control": "no-cache",
        **(headers or {}),
    }
    if last_event_id:
        req_headers["Last-Event-ID"] = last_event_id
    data = body.encode("utf-8") if body is not None and method.upper() != "GET" else None
    request = urllib.request.Request(url, data=data, headers=req_headers, method=method.upper())
    events: list[dict[str, Any]] = []
    buffer = ""
    try:
        with urllib.request.urlopen(request, timeout=timeout_s) as response:
            while len(events) < max_events:
                chunk = response.read(1024)
                if not chunk:
                    break
                buffer += chunk.decode("utf-8", errors="replace")
                while True:
                    if "\r\n\r\n" in buffer:
                        sep = "\r\n\r\n"
                    elif "\n\n" in buffer:
                        sep = "\n\n"
                    else:
                        break
                    block, buffer = buffer.split(sep, 1)
                    parsed = parse_block(block)
                    if parsed:
                        events.append(parsed)
                        if len(events) >= max_events:
                            return events
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace") if error.fp else ""
        raise RuntimeError(f"SSE handshake failed ({error.code}): {detail}") from error
    return events
