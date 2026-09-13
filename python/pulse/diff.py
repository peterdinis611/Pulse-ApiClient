"""Tiny JSON / line diff for MCP (no extra deps)."""

from __future__ import annotations

import json
from typing import Any


def pretty(value: object) -> str:
    if isinstance(value, str):
        stripped = value.strip()
        if stripped[:1] in "{[":
            try:
                return json.dumps(json.loads(stripped), indent=2, ensure_ascii=False)
            except json.JSONDecodeError:
                return value
        return value
    return json.dumps(value, indent=2, ensure_ascii=False, default=str)


def unified_lines(left: str, right: str) -> list[dict[str, str]]:
    a = left.replace("\r\n", "\n").split("\n")
    b = right.replace("\r\n", "\n").split("\n")
    rows: list[dict[str, str]] = []
    i = 0
    j = 0
    while i < len(a) or j < len(b):
        if i < len(a) and j < len(b) and a[i] == b[j]:
            rows.append({"kind": "same", "text": a[i]})
            i += 1
            j += 1
            continue
        if j < len(b) and (i >= len(a) or b[j] not in a[i + 1 :]):
            rows.append({"kind": "add", "text": b[j]})
            j += 1
            continue
        if i < len(a):
            rows.append({"kind": "del", "text": a[i]})
            i += 1
    return rows


def format_unified(rows: list[dict[str, str]], *, context: int = 2) -> str:
    lines: list[str] = []
    show = [False] * len(rows)
    for index, row in enumerate(rows):
        if row["kind"] != "same":
            for offset in range(max(0, index - context), min(len(rows), index + context + 1)):
                show[offset] = True
    for index, row in enumerate(rows):
        if not show[index]:
            continue
        prefix = " " if row["kind"] == "same" else ("+" if row["kind"] == "add" else "-")
        lines.append(f"{prefix}{row['text']}")
    added = sum(1 for row in rows if row["kind"] == "add")
    removed = sum(1 for row in rows if row["kind"] == "del")
    header = f"{removed} removed, {added} added"
    return header if not lines else f"{header}\n" + "\n".join(lines)


def parse_maybe_json(value: object) -> object:
    if isinstance(value, (dict, list)):
        return value
    if isinstance(value, str):
        stripped = value.strip()
        if stripped[:1] in "{[":
            try:
                return json.loads(stripped)
            except json.JSONDecodeError:
                return value
        return value
    return value


def compare(left: object, right: object) -> dict[str, Any]:
    left_text = pretty(left)
    right_text = pretty(right)
    rows = unified_lines(left_text, right_text)
    changed = [row for row in rows if row["kind"] != "same"]
    return {
        "equal": left_text == right_text,
        "removed": sum(1 for row in rows if row["kind"] == "del"),
        "added": sum(1 for row in rows if row["kind"] == "add"),
        "diff": format_unified(rows),
        "changedLines": changed[:80],
    }
