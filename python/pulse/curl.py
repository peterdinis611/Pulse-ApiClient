"""Parse a cURL command into a Pulse HTTP payload (stdlib only)."""

from __future__ import annotations

import re

_FLAG = re.compile(
    r"(?:(?P<flag>--data-urlencode|--data-binary|--data-raw|--data|--request|--header|--user|--url|-X|-H|-d|-u))\s+"
    r"(?:'([^']*)'|\"([^\"]*)\"|(\S+))",
    re.IGNORECASE,
)


def _unquote(groups: tuple[str | None, ...]) -> str:
    for item in groups:
        if item:
            return item
    return ""


def curl_to_payload(raw: str) -> dict:
    normalized = re.sub(r"\\\s*\n", " ", raw).strip()
    if "curl" not in normalized.lower():
        raise ValueError("Input does not look like a cURL command")

    method = ""
    headers: list[dict] = []
    body = ""
    auth: dict = {"authType": "none"}
    url = ""

    for match in _FLAG.finditer(normalized):
        flag = (match.group("flag") or "").lower()
        value = _unquote(match.group(2, 3, 4))
        if flag in {"-x", "--request"}:
            method = value.upper() or "GET"
        elif flag in {"-h", "--header"}:
            key, _, rest = value.partition(":")
            headers.append({"key": key.strip(), "value": rest.strip(), "enabled": True})
        elif flag in {"-d", "--data", "--data-raw", "--data-binary", "--data-urlencode"}:
            body = value
        elif flag in {"-u", "--user"}:
            username, _, password = value.partition(":")
            auth = {"authType": "basic", "basicUsername": username, "basicPassword": password}
        elif flag == "--url":
            url = value

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

    for header in headers:
        if header["key"].lower() == "authorization" and header["value"].lower().startswith("bearer "):
            auth = {"authType": "bearer", "bearerToken": header["value"][7:].strip()}

    if not method:
        method = "POST" if body.strip() else "GET"

    body_kind = "none"
    if body.strip():
        body_kind = "json" if body.strip()[:1] in "{[" else "raw"

    return {
        "method": method,
        "url": url,
        "headers": headers,
        "query": [],
        "bodyKind": body_kind,
        "body": body,
        "form": [],
        "multipart": [],
        "auth": auth,
    }
