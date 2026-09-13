"""Generate curl / fetch snippets from a Pulse HTTP payload."""

from __future__ import annotations

import json
import shlex


def _enabled(rows: object) -> list[tuple[str, str]]:
    if isinstance(rows, dict):
        return [(str(key), str(value)) for key, value in rows.items() if key]
    pairs: list[tuple[str, str]] = []
    for item in rows or []:
        if not isinstance(item, dict) or item.get("enabled") is False:
            continue
        key = str(item.get("key") or "").strip()
        if key:
            pairs.append((key, str(item.get("value") or "")))
    return pairs


def to_curl(payload: dict) -> str:
    method = str(payload.get("method") or "GET").upper()
    url = str(payload.get("url") or "")
    parts = ["curl", "-sS", "-X", method, url]
    for key, value in _enabled(payload.get("headers")):
        parts.extend(["-H", f"{key}: {value}"])
    auth = payload.get("auth") or {}
    if auth.get("authType") == "bearer" and auth.get("bearerToken"):
        parts.extend(["-H", f"Authorization: Bearer {auth['bearerToken']}"])
    elif auth.get("authType") == "basic":
        user = auth.get("basicUsername") or ""
        password = auth.get("basicPassword") or ""
        parts.extend(["-u", f"{user}:{password}"])
    body = str(payload.get("body") or "")
    if body and str(payload.get("bodyKind") or "none") not in {"", "none"}:
        parts.extend(["--data-raw", body])
    return shlex.join(parts)


def to_fetch(payload: dict) -> str:
    method = str(payload.get("method") or "GET").upper()
    url = str(payload.get("url") or "")
    headers = {key: value for key, value in _enabled(payload.get("headers"))}
    auth = payload.get("auth") or {}
    if auth.get("authType") == "bearer" and auth.get("bearerToken"):
        headers["Authorization"] = f"Bearer {auth['bearerToken']}"
    init: dict = {"method": method}
    if headers:
        init["headers"] = headers
    body = str(payload.get("body") or "")
    if body and str(payload.get("bodyKind") or "none") not in {"", "none"}:
        init["body"] = body
    return f"fetch({json.dumps(url)}, {json.dumps(init, indent=2)})"
