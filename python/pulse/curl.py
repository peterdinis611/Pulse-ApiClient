"""Parse / format cURL (Rust via pulse_native when available, else stdlib parser)."""

from __future__ import annotations

import json
import re
from typing import Any
from urllib.parse import unquote_plus

_FLAG = re.compile(
    r"(?:"
    r"(?P<bool>--compressed|--location|--get|--head|-L|-G|-I|-k|--insecure|--silent|-s|-S)"
    r"|"
    r"(?P<flag>--data-urlencode|--data-binary|--data-raw|--data|--json|--request|--header|--user|--url|"
    r"--user-agent|--referer|--cookie|--form|--max-time|--connect-timeout|"
    r"-X|-H|-d|-u|-A|-e|-b|-F|-m)\s+"
    r"(?:'(?P<sq>[^']*)'|\"(?P<dq>[^\"]*)\"|(?P<bare>\S+))"
    r")",
    re.IGNORECASE,
)


def _flag_value(match: re.Match[str]) -> str:
    for name in ("sq", "dq", "bare"):
        value = match.group(name)
        if value:
            return value
    return ""


def _shell_escape(value: str) -> str:
    if value == "":
        return "''"
    if re.fullmatch(r"[A-Za-z0-9_./:?&=%@,+~-]+", value):
        return value
    return "'" + value.replace("'", "'\\''") + "'"


def _encode_component(value: str) -> str:
    out: list[str] = []
    for ch in value.encode("utf-8"):
        if (
            65 <= ch <= 90
            or 97 <= ch <= 122
            or 48 <= ch <= 57
            or ch in {45, 95, 46, 126}
        ):
            out.append(chr(ch))
        else:
            out.append(f"%{ch:02X}")
    return "".join(out)


def curl_to_payload(raw: str) -> dict:
    try:
        import pulse_native

        if hasattr(pulse_native, "parse_curl_json"):
            return json.loads(pulse_native.parse_curl_json(raw))
    except ImportError:
        pass
    return _curl_to_payload_py(raw)


def payload_to_curl(payload: dict[str, Any]) -> str:
    try:
        import pulse_native

        if hasattr(pulse_native, "format_curl_json"):
            return pulse_native.format_curl_json(json.dumps(payload))
    except ImportError:
        pass
    return _payload_to_curl_py(payload)


def _curl_to_payload_py(raw: str) -> dict:
    normalized = re.sub(r"\\\s*\n", " ", raw).strip()
    if "curl" not in normalized.lower():
        raise ValueError("Input does not look like a cURL command")

    method = ""
    headers: list[dict] = []
    body_parts: list[str] = []
    form: list[dict] = []
    multipart: list[dict] = []
    auth: dict = {"authType": "none"}
    url = ""
    force_get = False
    force_head = False
    is_json = False

    for match in _FLAG.finditer(normalized):
        bool_flag = (match.group("bool") or "").lower()
        if bool_flag:
            if bool_flag in {"-g", "--get"}:
                force_get = True
            elif bool_flag in {"-i", "--head"}:
                force_head = True
            continue
        flag = (match.group("flag") or "").lower()
        value = _flag_value(match)
        if flag in {"-x", "--request"}:
            method = value.upper() or "GET"
        elif flag in {"-h", "--header"}:
            key, _, rest = value.partition(":")
            headers.append({"key": key.strip(), "value": rest.strip(), "enabled": True})
        elif flag in {"-d", "--data", "--data-raw", "--data-binary"}:
            body_parts.append(value)
        elif flag == "--data-urlencode":
            key, _, rest = value.partition("=")
            form.append({"key": key.strip(), "value": rest, "enabled": True})
        elif flag == "--json":
            is_json = True
            body_parts.append(value)
            if not any(h["key"].lower() == "content-type" for h in headers):
                headers.append({"key": "Content-Type", "value": "application/json", "enabled": True})
            if not any(h["key"].lower() == "accept" for h in headers):
                headers.append({"key": "Accept", "value": "application/json", "enabled": True})
        elif flag in {"-f", "--form"}:
            key, _, rest = value.partition("=")
            if rest.startswith("@"):
                path, _, mime = rest[1:].partition(";type=")
                name = path.rsplit("/", 1)[-1] or "file"
                multipart.append(
                    {
                        "key": key.strip(),
                        "enabled": True,
                        "fieldType": "file",
                        "value": "",
                        "fileName": name,
                        "mimeType": mime or None,
                    }
                )
            else:
                multipart.append(
                    {
                        "key": key.strip(),
                        "enabled": True,
                        "fieldType": "text",
                        "value": rest,
                        "fileName": None,
                        "mimeType": None,
                    }
                )
        elif flag in {"-u", "--user"}:
            username, _, password = value.partition(":")
            auth = {"authType": "basic", "basicUsername": username, "basicPassword": password}
        elif flag == "--url":
            url = value
        elif flag in {"-a", "--user-agent"}:
            headers.append({"key": "User-Agent", "value": value, "enabled": True})
        elif flag in {"-e", "--referer"}:
            headers.append({"key": "Referer", "value": value, "enabled": True})
        elif flag in {"-b", "--cookie"}:
            headers.append({"key": "Cookie", "value": value, "enabled": True})

    body = "&".join(body_parts)

    if not url:
        url_match = re.search(r"https?://[^\s'\"]+", normalized, re.IGNORECASE)
        if url_match:
            url = url_match.group(0)
        else:
            quoted = re.findall(r"'([^']+)'|\"([^\"]+)\"", normalized)
            candidates = [a or b for a, b in quoted]
            url = next((item for item in reversed(candidates) if item.startswith("http")), "")
    if not url:
        raise ValueError("Could not find URL in cURL command")

    query: list[dict] = []
    if "?" in url and "{" not in url.split("?", 1)[1]:
        base, qs = url.split("?", 1)
        url = base
        for part in qs.split("&"):
            if not part:
                continue
            key, _, rest = part.partition("=")
            query.append({"key": unquote_plus(key), "value": unquote_plus(rest), "enabled": True})

    for header in headers:
        if header["key"].lower() == "authorization" and header["value"].lower().startswith("bearer "):
            auth = {"authType": "bearer", "bearerToken": header["value"][7:].strip()}

    if not method:
        if force_head:
            method = "HEAD"
        elif force_get:
            method = "GET"
        elif body.strip() or form or multipart:
            method = "POST"
        else:
            method = "GET"
    if force_head:
        method = "HEAD"
    if force_get and body.strip():
        method = "GET"
        for part in body.split("&"):
            key, _, rest = part.partition("=")
            query.append({"key": key, "value": rest, "enabled": True})
        body = ""

    if auth.get("authType") == "bearer":
        headers = [h for h in headers if h["key"].lower() != "authorization"]

    body_kind = "none"
    if multipart:
        body_kind = "multipart"
    elif form and not body.strip():
        body_kind = "form"
    elif body.strip():
        trimmed = body.strip()
        if is_json or trimmed[:1] in "{[":
            body_kind = "json"
        elif "=" in body and trimmed[:1] not in "{[" and any(
            h["key"].lower() == "content-type" and "x-www-form-urlencoded" in h["value"].lower()
            for h in headers
        ):
            for part in body.split("&"):
                key, _, rest = part.partition("=")
                form.append({"key": unquote_plus(key), "value": unquote_plus(rest), "enabled": True})
            body = ""
            body_kind = "form"
        else:
            body_kind = "raw"

    return {
        "method": method,
        "url": url,
        "headers": headers,
        "query": query,
        "bodyKind": body_kind,
        "body": body,
        "form": form,
        "multipart": multipart,
        "auth": auth,
    }


def _payload_to_curl_py(payload: dict[str, Any]) -> str:
    method = str(payload.get("method") or "GET").upper()
    url = str(payload.get("url") or "").strip()
    parts = ["curl"]
    if method != "GET":
        parts.extend(["-X", method])

    header_keys: set[str] = set()
    for header in payload.get("headers") or []:
        if header.get("enabled") is False:
            continue
        key = str(header.get("key") or "").strip()
        if not key:
            continue
        header_keys.add(key.lower())
        parts.extend(["-H", _shell_escape(f"{key}: {header.get('value') or ''}")])

    auth = payload.get("auth") or {}
    auth_type = str(auth.get("authType") or "none")
    if auth_type in {"bearer", "oauth2"}:
        token = str(auth.get("bearerToken") or "").strip()
        if token and "authorization" not in header_keys:
            parts.extend(["-H", _shell_escape(f"Authorization: Bearer {token}")])
    elif auth_type == "basic":
        user = str(auth.get("basicUsername") or "")
        password = str(auth.get("basicPassword") or "")
        if user or password:
            parts.extend(["-u", _shell_escape(f"{user}:{password}")])
    elif auth_type == "apiKey":
        key = str(auth.get("apiKeyKey") or "").strip()
        value = str(auth.get("apiKeyValue") or "")
        if key and auth.get("apiKeyIn") != "query" and key.lower() not in header_keys:
            parts.extend(["-H", _shell_escape(f"{key}: {value}")])

    query = [
        item
        for item in (payload.get("query") or [])
        if item.get("enabled", True) and str(item.get("key") or "").strip()
    ]
    if query:
        qs = "&".join(
            f"{_encode_component(str(item['key']).strip())}={_encode_component(str(item.get('value') or ''))}"
            for item in query
        )
        url = f"{url}&{qs}" if "?" in url else f"{url}?{qs}"

    body = str(payload.get("body") or "")
    body_kind = str(payload.get("bodyKind") or "none")
    if body_kind in {"json", "graphql"} and body.strip():
        if "content-type" not in header_keys:
            parts.extend(["-H", _shell_escape("Content-Type: application/json")])
        parts.extend(["--data-raw", _shell_escape(body)])
    elif body_kind == "raw" and body:
        parts.extend(["--data-raw", _shell_escape(body)])
    elif body_kind == "form":
        for field in payload.get("form") or []:
            if field.get("enabled") is False:
                continue
            key = str(field.get("key") or "").strip()
            if not key:
                continue
            parts.extend(["--data-urlencode", _shell_escape(f"{key}={field.get('value') or ''}")])
    elif body_kind == "multipart":
        for field in payload.get("multipart") or []:
            if field.get("enabled") is False:
                continue
            key = str(field.get("key") or "").strip()
            if not key:
                continue
            if field.get("fieldType") == "file":
                name = field.get("fileName") or "file"
                value = f"{key}=@{name}"
                if field.get("mimeType"):
                    value = f"{value};type={field['mimeType']}"
                parts.extend(["-F", _shell_escape(value)])
            else:
                parts.extend(["-F", _shell_escape(f"{key}={field.get('value') or ''}")])

    parts.append("--compressed")
    if url:
        parts.append(_shell_escape(url))
    return " ".join(parts)
