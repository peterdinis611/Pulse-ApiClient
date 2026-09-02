"""Turn Pulse collection exports into CollectionRunInput for the Rust runner."""

from __future__ import annotations

from ._util import uid


PULSE_SCHEMA = "https://schema.pulse.dev/collection/v1.json"


def is_run_input(payload: object) -> bool:
    return isinstance(payload, dict) and "collectionId" in payload and "requests" in payload


def _variables_from_map(env: dict[str, str]) -> list[dict]:
    return [
        {"id": uid("var"), "key": key, "value": value, "enabled": True}
        for key, value in env.items()
        if key
    ]


def _environment(env: dict[str, str] | None) -> dict | None:
    if not env:
        return None
    return {"id": uid("env"), "name": "cli", "variables": _variables_from_map(env)}


def _flatten_pulse_items(items: list, folder: str = "") -> list[dict]:
    requests: list[dict] = []
    for item in items or []:
        children = item.get("item")
        if children:
            next_folder = f"{folder}/{item.get('name')}" if folder else str(item.get("name") or "")
            requests.extend(_flatten_pulse_items(children, next_folder))
            continue
        request = item.get("request")
        if not request:
            continue
        requests.append(
            {
                "name": item.get("name") or request.get("name") or "Request",
                "folder": folder or None,
                "request": request,
            }
        )
    return requests


def _to_saved(collection_id: str, items: list[dict]) -> list[dict]:
    saved = []
    for item in items:
        request = item.get("request")
        if not isinstance(request, dict):
            continue
        saved.append(
            {
                "id": item.get("id") or uid("saved"),
                "name": item.get("name") or request.get("name") or "Request",
                "collectionId": item.get("collectionId") or collection_id,
                "folder": item.get("folder"),
                "request": request,
            }
        )
    return saved


def to_run_input(
    payload: dict,
    *,
    env: dict[str, str] | None = None,
    collection_id: str | None = None,
    globals_env: dict[str, str] | None = None,
    data_rows: list[dict] | None = None,
) -> dict:
    if is_run_input(payload):
        output = dict(payload)
        if env:
            output["environment"] = _environment(env)
        if globals_env:
            output["globals"] = _variables_from_map(globals_env)
        if data_rows is not None:
            output["dataRows"] = data_rows
        return output

    schema = ((payload.get("info") or {}).get("schema") or "") if isinstance(payload.get("info"), dict) else ""
    if schema == PULSE_SCHEMA or ("pulse" in schema and "collection" in schema and isinstance(payload.get("item"), list)):
        collection_id = collection_id or uid("col")
        flat = _flatten_pulse_items(payload.get("item") or [])
        collection = {
            "id": collection_id,
            "name": (payload.get("info") or {}).get("name") or "Collection",
            "folders": payload.get("folders") or [],
            "auth": payload.get("auth"),
            "variables": payload.get("variables") or [],
            "preRequestScript": payload.get("preRequestScript"),
            "tests": payload.get("tests"),
            "folderConfigs": payload.get("folderConfigs") or [],
        }
        requests = []
        for item in flat:
            requests.append(
                {
                    "id": uid("saved"),
                    "name": item["name"],
                    "collectionId": collection_id,
                    "folder": item["folder"],
                    "request": item["request"],
                }
            )
        return {
            "collectionId": collection_id,
            "collectionName": collection["name"],
            "requests": requests,
            "environment": _environment(env),
            "globals": _variables_from_map(globals_env or {}),
            "collection": collection,
            "dataRows": data_rows or [],
        }

    groups = payload.get("collectionGroups") or []
    saved = payload.get("collections") or []
    if groups or saved:
        group = None
        if collection_id:
            group = next((item for item in groups if item.get("id") == collection_id), None)
        if group is None and groups:
            group = groups[0]
        chosen_id = (group or {}).get("id") or collection_id or uid("col")
        requests = [item for item in saved if not chosen_id or item.get("collectionId") == chosen_id]
        if not requests:
            requests = saved
        return {
            "collectionId": chosen_id,
            "collectionName": (group or {}).get("name") or "Collection",
            "requests": _to_saved(chosen_id, requests),
            "environment": _environment(env),
            "globals": _variables_from_map(globals_env or {}),
            "collection": group,
            "dataRows": data_rows or [],
        }

    raise ValueError(
        "Unrecognized collection JSON. Export from Pulse, or pass a CollectionRunInput object."
    )
