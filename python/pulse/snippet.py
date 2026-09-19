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


def to_httpie(payload: dict) -> str:
    method = str(payload.get("method") or "GET").upper()
    url = str(payload.get("url") or "")
    parts = ["http", method, url]
    for key, value in _enabled(payload.get("headers")):
        parts.append(f"{key}:{value}")
    auth = payload.get("auth") or {}
    if auth.get("authType") == "bearer" and auth.get("bearerToken"):
        parts.append(f"Authorization:Bearer {auth['bearerToken']}")
    elif auth.get("authType") == "basic":
        user = auth.get("basicUsername") or ""
        password = auth.get("basicPassword") or ""
        parts.extend(["-a", f"{user}:{password}"])
    body = str(payload.get("body") or "")
    if body and str(payload.get("bodyKind") or "none") not in {"", "none"}:
        parts.extend(["<<<", body])
    return shlex.join(parts)


def to_python(payload: dict) -> str:
    method = str(payload.get("method") or "GET").upper()
    url = str(payload.get("url") or "")
    headers = {key: value for key, value in _enabled(payload.get("headers"))}
    auth = payload.get("auth") or {}
    if auth.get("authType") == "bearer" and auth.get("bearerToken"):
        headers["Authorization"] = f"Bearer {auth['bearerToken']}"
    body = str(payload.get("body") or "")
    has_body = bool(body) and str(payload.get("bodyKind") or "none") not in {"", "none"}
    lines = ["import requests", ""]
    if headers:
        lines.append(f"headers = {json.dumps(headers, indent=2)}")
    kwargs = [f"{json.dumps(url)}"]
    if headers:
        kwargs.append("headers=headers")
    if has_body:
        if str(payload.get("bodyKind") or "") == "json":
            try:
                parsed = json.loads(body)
                lines.append(f"payload = {json.dumps(parsed, indent=2)}")
                kwargs.append("json=payload")
            except json.JSONDecodeError:
                lines.append(f"data = {json.dumps(body)}")
                kwargs.append("data=data")
        else:
            lines.append(f"data = {json.dumps(body)}")
            kwargs.append("data=data")
    if auth.get("authType") == "basic":
        user = auth.get("basicUsername") or ""
        password = auth.get("basicPassword") or ""
        kwargs.append(f"auth=({json.dumps(user)}, {json.dumps(password)})")
    lines.append(f"response = requests.{method.lower()}({', '.join(kwargs)})")
    lines.append("print(response.status_code)")
    lines.append("print(response.text)")
    return "\n".join(lines)


def to_axios(payload: dict) -> str:
    method = str(payload.get("method") or "GET").lower()
    url = str(payload.get("url") or "")
    headers = {key: value for key, value in _enabled(payload.get("headers"))}
    auth = payload.get("auth") or {}
    if auth.get("authType") == "bearer" and auth.get("bearerToken"):
        headers["Authorization"] = f"Bearer {auth['bearerToken']}"
    config: dict = {"method": method, "url": url}
    if headers:
        config["headers"] = headers
    body = str(payload.get("body") or "")
    if body and str(payload.get("bodyKind") or "none") not in {"", "none"}:
        if str(payload.get("bodyKind") or "") == "json":
            try:
                config["data"] = json.loads(body)
            except json.JSONDecodeError:
                config["data"] = body
        else:
            config["data"] = body
    return f"await axios({json.dumps(config, indent=2)})"


SNIPPET_FORMATS = {
    "curl": to_curl,
    "fetch": to_fetch,
    "httpie": to_httpie,
    "python": to_python,
    "axios": to_axios,
}
