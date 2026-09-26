"""Parse a cURL command into a Pulse HTTP payload (stdlib only)."""

from __future__ import annotations

import re

_FLAG = re.compile(
    r"(?:(?P<flag>--data-urlencode|--data-binary|--data-raw|--data|--json|--request|--header|--user|--url|"
    r"--user-agent|--referer|--cookie|--form|-X|-H|-d|-u|-A|-e|-b|-F))\s+"
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
    body_parts: list[str] = []
    form: list[dict] = []
    multipart: list[dict] = []
    auth: dict = {"authType": "none"}
    url = ""
    force_get = bool(re.search(r"(?i)(?:-G|--get)(?![A-Za-z0-9_-])", normalized))
    force_head = bool(re.search(r"(?i)(?:-I|--head)(?![A-Za-z0-9_-])", normalized))
    is_json = False

    for match in _FLAG.finditer(normalized):
        flag = (match.group("flag") or "").lower()
        value = _unquote(match.group(2, 3, 4))
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

    for header in headers:
        if header["key"].lower() == "authorization" and header["value"].lower().startswith("bearer "):
            auth = {"authType": "bearer", "bearerToken": header["value"][7:].strip()}

    query: list[dict] = []
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

    body_kind = "none"
    if multipart:
        body_kind = "multipart"
    elif form and not body.strip():
        body_kind = "form"
    elif body.strip():
        body_kind = "json" if is_json or body.strip()[:1] in "{[" else "raw"

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
