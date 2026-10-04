"""Structured agent memory — workspace YAML + gitignored local YAML (stdlib fallback)."""

from __future__ import annotations

import re
import time
from pathlib import Path
from typing import Any

from pulse.workspace import _load_yaml


def _now_iso() -> str:
    millis = int(time.time() * 1000)
    secs, ms = divmod(millis, 1000)
    return f"{secs}.{ms:03d}Z"


def _new_id() -> str:
    return f"fact_{_now_iso().replace('.', '')}"


def normalize_key(raw: str) -> str:
    cleaned = []
    for ch in (raw or "").strip():
        if ch.isalnum() or ch in {"_", "-", "."}:
            cleaned.append(ch.lower())
        elif ch.isspace():
            cleaned.append("_")
        else:
            cleaned.append("_")
    return "".join(cleaned).strip("_")


def workspace_facts_path(root: str | Path) -> Path:
    return Path(root) / "memory" / "facts.yaml"


def local_facts_path(root: str | Path) -> Path:
    return Path(root) / ".pulse" / "memory-local.yaml"


def _path_for_scope(root: str | Path, scope: str) -> Path:
    return local_facts_path(root) if scope == "local" else workspace_facts_path(root)


def _dump_yaml(data: dict[str, Any]) -> str:
    try:
        import yaml  # type: ignore

        return yaml.safe_dump(data, sort_keys=False, allow_unicode=True)
    except ImportError:
        lines = [f"version: {data.get('version', 1)}", "facts:"]
        facts = data.get("facts") or []
        if not facts:
            lines.append("  []")
            return "\n".join(lines) + "\n"
        for fact in facts:
            lines.append(f"  - id: {fact.get('id')}")
            lines.append(f"    key: {fact.get('key')}")
            value = str(fact.get("value") or "").replace('"', '\\"')
            lines.append(f'    value: "{value}"')
            tags = fact.get("tags") or []
            if tags:
                lines.append(f"    tags: [{', '.join(tags)}]")
            else:
                lines.append("    tags: []")
            lines.append(f"    scope: {fact.get('scope')}")
            lines.append(f"    createdAt: {fact.get('createdAt')}")
            lines.append(f"    updatedAt: {fact.get('updatedAt')}")
            lines.append(f"    source: {fact.get('source')}")
            if fact.get("note"):
                note = str(fact["note"]).replace('"', '\\"')
                lines.append(f'    note: "{note}"')
        return "\n".join(lines) + "\n"


def _load_file(path: Path) -> dict[str, Any]:
    if not path.is_file():
        return {"version": 1, "facts": []}
    loaded = _load_yaml(path)
    if not isinstance(loaded, dict):
        return {"version": 1, "facts": []}
    facts = loaded.get("facts") or []
    if not isinstance(facts, list):
        facts = []
    return {"version": int(loaded.get("version") or 1), "facts": facts}


def _save_file(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(_dump_yaml(data), encoding="utf-8")


def list_facts(root: str | Path, scope: str | None = None) -> list[dict[str, Any]]:
    scopes = [scope] if scope in {"workspace", "local"} else ["workspace", "local"]
    out: list[dict[str, Any]] = []
    for item_scope in scopes:
        file = _load_file(_path_for_scope(root, item_scope))
        for fact in file["facts"]:
            if not isinstance(fact, dict):
                continue
            row = dict(fact)
            row["scope"] = item_scope
            # Normalize camelCase from Rust YAML
            if "created_at" in row and "createdAt" not in row:
                row["createdAt"] = row.pop("created_at")
            if "updated_at" in row and "updatedAt" not in row:
                row["updatedAt"] = row.pop("updated_at")
            out.append(row)
    out.sort(key=lambda f: str(f.get("updatedAt") or ""), reverse=True)
    return out


def get_fact(root: str | Path, key: str, scope: str | None = None) -> dict[str, Any] | None:
    needle = normalize_key(key)
    for fact in list_facts(root, scope):
        if normalize_key(str(fact.get("key") or "")) == needle:
            return fact
    return None


def search_facts(root: str | Path, query: str) -> list[dict[str, Any]]:
    q = (query or "").strip().lower()
    if not q:
        return list_facts(root)
    out = []
    for fact in list_facts(root):
        blob = " ".join(
            [
                str(fact.get("key") or ""),
                str(fact.get("value") or ""),
                str(fact.get("note") or ""),
                " ".join(fact.get("tags") or []),
            ]
        ).lower()
        if q in blob:
            out.append(fact)
    return out


def upsert_fact(
    root: str | Path,
    *,
    key: str,
    value: str,
    scope: str = "workspace",
    source: str = "cli",
    tags: list[str] | None = None,
    note: str | None = None,
) -> dict[str, Any]:
    key_n = normalize_key(key)
    value_n = (value or "").strip()
    if not key_n:
        raise ValueError("Memory key is empty")
    if not value_n:
        raise ValueError("Memory value is empty")
    scope_n = "local" if scope == "local" else "workspace"
    path = _path_for_scope(root, scope_n)
    file = _load_file(path)
    now = _now_iso()
    tags_n = [t.strip() for t in (tags or []) if t and t.strip()]
    for fact in file["facts"]:
        if normalize_key(str(fact.get("key") or "")) == key_n:
            fact["value"] = value_n
            fact["tags"] = tags_n
            fact["updatedAt"] = now
            fact["source"] = source
            fact["scope"] = scope_n
            if note:
                fact["note"] = note.strip()
            elif "note" in fact and not note:
                fact.pop("note", None)
            _save_file(path, file)
            return fact
    fact = {
        "id": _new_id(),
        "key": key_n,
        "value": value_n,
        "tags": tags_n,
        "scope": scope_n,
        "createdAt": now,
        "updatedAt": now,
        "source": source,
    }
    if note and note.strip():
        fact["note"] = note.strip()
    file["facts"].append(fact)
    _save_file(path, file)
    return fact


def delete_fact(root: str | Path, key: str, scope: str | None = None) -> bool:
    key_n = normalize_key(key)
    if not key_n:
        raise ValueError("Memory key is empty")
    scopes = [scope] if scope in {"workspace", "local"} else ["workspace", "local"]
    removed = False
    for item_scope in scopes:
        path = _path_for_scope(root, item_scope)
        file = _load_file(path)
        before = len(file["facts"])
        file["facts"] = [
            fact
            for fact in file["facts"]
            if normalize_key(str(fact.get("key") or "")) != key_n
        ]
        if len(file["facts"]) != before:
            removed = True
            _save_file(path, file)
    return removed


def parse_remember_pair(raw: str) -> tuple[str, str] | None:
    trimmed = (raw or "").strip()
    if not trimmed:
        return None
    if "=" in trimmed:
        key, value = trimmed.split("=", 1)
        key, value = key.strip(), value.strip().strip("\"'")
        if key and value:
            return key, value
    if ":" in trimmed:
        key, value = trimmed.split(":", 1)
        key, value = key.strip(), value.strip().strip("\"'")
        if key and value and " " not in key:
            return key, value
    match = re.search(r"^(.+?)\s+is\s+(.+)$", trimmed, re.I)
    if match:
        key, value = match.group(1).strip(), match.group(2).strip().strip("\"'")
        if key and value:
            return key, value
    return None


def format_facts_markdown(facts: list[dict[str, Any]], title: str) -> str:
    if not facts:
        return f"**{title}**\n\n_(empty)_"
    lines = [f"**{title}** ({len(facts)})", ""]
    for fact in facts[:40]:
        tags = fact.get("tags") or []
        tag_bit = f" · {', '.join(tags)}" if tags else ""
        note = fact.get("note")
        note_bit = f" — _{note}_" if note else ""
        lines.append(
            f"- `{fact.get('key')}` = {fact.get('value')} "
            f"`[{fact.get('scope')}]`{tag_bit}{note_bit}"
        )
    if len(facts) > 40:
        lines.append(f"…+{len(facts) - 40} more")
    return "\n".join(lines)
