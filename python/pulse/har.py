from __future__ import annotations

from urllib.parse import urlparse

from ._util import kv, uid


def har_to_pulse(har: dict) -> dict:
    entries = ((har.get("log") or {}).get("entries")) or har.get("entries") or []
    collection_id = uid("col")
    collection = {
        "id": collection_id,
        "name": ((har.get("log") or {}).get("creator") or {}).get("name") or "HAR import",
        "source": "pulse",
        "folders": [],
    }
    requests = []
    for entry in entries:
        request = entry.get("request") or {}
        url = request.get("url") or ""
        parsed = urlparse(url)
        if parsed.scheme not in {"http", "https"}:
            continue
        method = (request.get("method") or "GET").upper()
        headers = [
            kv(item.get("name") or "", item.get("value") or "")
            for item in request.get("headers") or []
            if item.get("name") and not str(item.get("name")).startswith(":")
        ]
        query = [
            kv(item.get("name") or "", item.get("value") or "")
            for item in request.get("queryString") or []
            if item.get("name")
        ]
        post = request.get("postData") or {}
        mime = (post.get("mimeType") or "").split(";")[0].strip().lower()
        body = post.get("text") or ""
        body_kind = "none"
        form = []
        if mime == "application/json":
            body_kind = "json"
        elif mime in {"application/x-www-form-urlencoded", "multipart/form-data"}:
            body_kind = "form"
            form = [
                kv(item.get("name") or "", item.get("value") or "")
                for item in post.get("params") or []
                if item.get("name")
            ]
        elif body:
            body_kind = "raw"
        name = f"{method} {parsed.path or '/'}"
        api_request = {
            "id": uid("req"),
            "name": name,
            "protocol": "http",
            "method": method,
            "url": url,
            "headers": headers,
            "query": query,
            "pathParams": [],
            "bodyKind": body_kind,
            "body": body if body_kind in {"json", "raw"} else "",
            "form": form,
            "multipart": [],
            "auth": {"authType": "inherit"},
            "tests": "",
            "preRequestScript": "",
        }
        requests.append(
            {
                "id": uid("saved"),
                "name": name,
                "collectionId": collection_id,
                "request": api_request,
            }
        )
    return {"version": 1, "collectionGroups": [collection], "collections": requests}


def _enabled(rows: object) -> list[dict]:
    pairs: list[dict] = []
    for item in rows or []:
        if not isinstance(item, dict) or item.get("enabled") is False:
            continue
        key = str(item.get("key") or "").strip()
        if key:
            pairs.append({"name": key, "value": str(item.get("value") or "")})
    return pairs


def _post_data(request: dict) -> dict | None:
    kind = str(request.get("bodyKind") or "none")
    if kind in {"", "none"}:
        return None
    if kind == "form":
        params = _enabled(request.get("form"))
        text = "&".join(f"{p['name']}={p['value']}" for p in params)
        return {"mimeType": "application/x-www-form-urlencoded", "params": params, "text": text}
    if kind == "multipart":
        params = []
        for item in request.get("multipart") or []:
            if not isinstance(item, dict) or item.get("enabled") is False:
                continue
            key = str(item.get("key") or "").strip()
            if not key:
                continue
            row: dict = {"name": key, "value": str(item.get("value") or "")}
            if item.get("fileName"):
                row["fileName"] = str(item["fileName"])
            params.append(row)
        return {"mimeType": "multipart/form-data", "params": params}
    if kind == "graphql":
        import json

        text = json.dumps(
            {
                "query": request.get("graphqlQuery") or "",
                "variables": {},
            }
        )
        return {"mimeType": "application/json", "text": text}
    if kind == "json":
        return {"mimeType": "application/json", "text": str(request.get("body") or "")}
    return {"mimeType": "text/plain", "text": str(request.get("body") or "")}


def history_to_har(entries: list[dict], *, creator: str = "Pulse", version: str = "2.1.0") -> dict:
    """Build a HAR 1.2 log from Pulse history / collection request entries."""
    har_entries = []
    for entry in entries:
        request = entry.get("request") or entry
        if not isinstance(request, dict):
            continue
        method = str(request.get("method") or "GET").upper()
        url = str(request.get("url") or "")
        if not url:
            continue
        headers = _enabled(request.get("headers"))
        query = _enabled(request.get("query"))
        post = _post_data(request)
        response = entry.get("response") or {}
        status = int(response.get("status") or 0)
        elapsed = int(response.get("elapsedMs") or response.get("elapsed_ms") or 0)
        size = int(response.get("sizeBytes") or response.get("size_bytes") or 0)
        body_size = len(str(post.get("text") or "")) if post else 0
        har_entries.append(
            {
                "startedDateTime": entry.get("sentAt") or entry.get("sent_at") or "",
                "time": elapsed,
                "request": {
                    "method": method,
                    "url": url,
                    "httpVersion": "HTTP/1.1",
                    "cookies": [],
                    "headers": headers,
                    "queryString": query,
                    **({"postData": post} if post else {}),
                    "headersSize": -1,
                    "bodySize": body_size,
                },
                "response": {
                    "status": status,
                    "statusText": str(status) if status else "",
                    "httpVersion": "HTTP/1.1",
                    "cookies": [],
                    "headers": [],
                    "content": {
                        "size": size,
                        "mimeType": "application/octet-stream",
                        "text": "",
                        "comment": "Pulse history stores status/timing/size only",
                    },
                    "redirectURL": "",
                    "headersSize": -1,
                    "bodySize": size,
                },
                "cache": {},
                "timings": {
                    "blocked": -1,
                    "dns": -1,
                    "connect": -1,
                    "send": 0,
                    "wait": elapsed,
                    "receive": 0,
                    "ssl": -1,
                },
                "comment": f"pulse:{entry.get('source') or 'desktop'}",
            }
        )
    return {
        "log": {
            "version": "1.2",
            "creator": {"name": creator, "version": version},
            "entries": har_entries,
        }
    }


def pulse_to_har(payload: dict) -> dict:
    """Export a Pulse collection dump (or history array) as HAR."""
    if isinstance(payload.get("log"), dict):
        return payload
    history = payload.get("history")
    if isinstance(history, list):
        return history_to_har(history)
    collections = payload.get("collections") or []
    entries = [{"request": item.get("request") or item, "source": "cli"} for item in collections]
    return history_to_har(entries)
