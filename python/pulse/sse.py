"""SSE parse + stream collect (Rust via pulse_native when available)."""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any, Iterator


def parse_block(block: str) -> dict[str, Any] | None:
    """Parse one SSE event block. Prefers pulse_native.parse_sse_json."""
    try:
        import pulse_native

        if hasattr(pulse_native, "parse_sse_json"):
            events = json.loads(
                pulse_native.parse_sse_json(block if block.endswith("\n\n") else block + "\n\n")
            )
            if isinstance(events, list) and events:
                return events[0]
            return None
    except ImportError:
        pass
    return _parse_block_py(block)


def parse_text(text: str) -> list[dict[str, Any]]:
    try:
        import pulse_native

        if hasattr(pulse_native, "parse_sse_json"):
            events = json.loads(pulse_native.parse_sse_json(text))
            return events if isinstance(events, list) else []
    except ImportError:
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
    text = text.lstrip("\ufeff")
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
    event: str | None = None,
) -> list[dict[str, Any]]:
    """Open an HTTP SSE stream and collect up to max_events."""
    try:
        import pulse_native

        if hasattr(pulse_native, "collect_sse_json"):
            raw = pulse_native.collect_sse_json(
                url,
                method or "GET",
                json.dumps(headers or {}),
                body,
                int(max_events),
                int(timeout_s * 1000),
                last_event_id,
                event,
            )
            events = json.loads(raw)
            return events if isinstance(events, list) else []
    except ImportError:
        pass
    except Exception as error:  # noqa: BLE001
        raise RuntimeError(str(error)) from error
    return _collect_py(
        url,
        method=method,
        headers=headers,
        body=body,
        max_events=max_events,
        timeout_s=timeout_s,
        last_event_id=last_event_id,
        event=event,
    )


def _collect_py(
    url: str,
    *,
    method: str = "GET",
    headers: dict[str, str] | None = None,
    body: str | None = None,
    max_events: int = 50,
    timeout_s: float = 30.0,
    last_event_id: str | None = None,
    event: str | None = None,
) -> list[dict[str, Any]]:
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
    needle = (event or "").strip().lower()
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
                    if not parsed:
                        continue
                    if needle and str(parsed.get("event") or "message").lower() != needle:
                        continue
                    events.append(parsed)
                    if len(events) >= max_events:
                        return events
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace") if error.fp else ""
        raise RuntimeError(f"SSE handshake failed ({error.code}): {detail}") from error
    return events
