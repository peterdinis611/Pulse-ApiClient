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
