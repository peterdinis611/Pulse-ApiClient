"""JSON / line diff for MCP/CLI (Rust via pulse_native when available)."""

from __future__ import annotations

import json
from typing import Any


def pretty(value: object, *, sort_keys: bool = True) -> str:
    if isinstance(value, str):
        stripped = value.strip()
        if stripped[:1] in "{[":
            try:
                return json.dumps(json.loads(stripped), indent=2, ensure_ascii=False, sort_keys=sort_keys)
            except json.JSONDecodeError:
                return value
        return value
    return json.dumps(value, indent=2, ensure_ascii=False, default=str, sort_keys=sort_keys)


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
        if i < len(a) and j < len(b):
            try:
                a_in_b = b.index(a[i], j + 1)
            except ValueError:
                a_in_b = -1
            try:
                b_in_a = a.index(b[j], i + 1)
            except ValueError:
                b_in_a = -1
            if a_in_b >= 0 and (b_in_a < 0 or (a_in_b - j) <= (b_in_a - i)):
                rows.append({"kind": "add", "text": b[j]})
                j += 1
                continue
            if b_in_a >= 0:
                rows.append({"kind": "del", "text": a[i]})
                i += 1
                continue
            rows.append({"kind": "del", "text": a[i]})
            rows.append({"kind": "add", "text": b[j]})
            i += 1
            j += 1
            continue
        if j < len(b):
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
    gap = False
    for index, row in enumerate(rows):
        if not show[index]:
            gap = True
            continue
        if gap and lines:
            lines.append("@@")
        gap = False
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


def path_changes(left: object, right: object, path: str = "$") -> list[dict[str, Any]]:
    if left == right:
        return []
    if isinstance(left, dict) and isinstance(right, dict):
        out: list[dict[str, Any]] = []
        for key in sorted(set(left) | set(right)):
            child = f"$.{key}" if path == "$" else f"{path}.{key}"
            if key in left and key in right:
                out.extend(path_changes(left[key], right[key], child))
            elif key in left:
                out.append({"path": child, "kind": "del", "left": left[key], "right": None})
            else:
                out.append({"path": child, "kind": "add", "left": None, "right": right[key]})
        return out
    if isinstance(left, list) and isinstance(right, list):
        out = []
        length = max(len(left), len(right))
        for index in range(length):
            child = f"{path}[{index}]"
            if index < len(left) and index < len(right):
                out.extend(path_changes(left[index], right[index], child))
            elif index < len(left):
                out.append({"path": child, "kind": "del", "left": left[index], "right": None})
            else:
                out.append({"path": child, "kind": "add", "left": None, "right": right[index]})
        return out
    return [{"path": path, "kind": "change", "left": left, "right": right}]


def _compare_py(left: object, right: object) -> dict[str, Any]:
    left_value = parse_maybe_json(left)
    right_value = parse_maybe_json(right)
    left_text = pretty(left_value)
    right_text = pretty(right_value)
    rows = unified_lines(left_text, right_text)
    changed = [row for row in rows if row["kind"] != "same"]
    paths = (
        path_changes(left_value, right_value)
        if isinstance(left_value, (dict, list)) or isinstance(right_value, (dict, list))
        else []
    )
    return {
        "equal": left_text == right_text,
        "removed": sum(1 for row in rows if row["kind"] == "del"),
        "added": sum(1 for row in rows if row["kind"] == "add"),
        "pathsChanged": len(paths),
        "diff": format_unified(rows),
        "changedLines": changed[:80],
        "paths": paths[:80],
    }


def compare(left: object, right: object) -> dict[str, Any]:
    try:
        import pulse_native

        if hasattr(pulse_native, "diff_json"):
            return json.loads(pulse_native.diff_json(json.dumps(left), json.dumps(right)))
    except Exception:
        pass
    return _compare_py(left, right)
