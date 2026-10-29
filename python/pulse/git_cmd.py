"""Thin git CLI wrappers shared by MCP and the Pulse CLI."""

from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Any


def _validate_root(root: str | Path) -> Path:
    path = Path(str(root).strip())
    if not str(root).strip() or "\0" in str(root):
        raise ValueError("Invalid workspace root")
    if not path.is_dir():
        raise ValueError(f"Not a directory: {root}")
    return path


def git_run(root: str | Path, *args: str) -> tuple[int, str, str]:
    path = _validate_root(root)
    proc = subprocess.run(
        ["git", "-C", str(path), *args],
        capture_output=True,
        text=True,
        check=False,
    )
    return proc.returncode, proc.stdout or "", proc.stderr or ""


def git_status(root: str | Path) -> dict[str, Any]:
    code, out, err = git_run(root, "status", "--porcelain=v1", "-b")
    if code != 0:
        raise RuntimeError(err.strip() or "git status failed")
    lines = out.splitlines()
    branch = "HEAD"
    ahead = 0
    behind = 0
    dirty = False
    conflicted: list[str] = []
    files: list[dict[str, str]] = []
    for index, line in enumerate(lines):
        if index == 0 and line.startswith("## "):
            rest = line[3:]
            name, _, tracking = rest.partition("...")
            branch = name.split()[0] if name.split() else "HEAD"
            if "[" in tracking:
                bracket = tracking[tracking.find("[") :]
                if "ahead " in bracket:
                    digits = "".join(ch for ch in bracket.split("ahead ", 1)[1] if ch.isdigit())
                    ahead = int(digits or "0")
                if "behind " in bracket:
                    digits = "".join(ch for ch in bracket.split("behind ", 1)[1] if ch.isdigit())
                    behind = int(digits or "0")
            continue
        if len(line) < 2:
            continue
        dirty = True
        xy = line[:2]
        path = line[3:].strip()
        if not path:
            continue
        if "U" in xy or xy in {"AA", "DD"}:
            conflicted.append(path)
        files.append({"path": path, "xy": xy})
    return {
        "branch": branch,
        "dirty": dirty,
        "ahead": ahead,
        "behind": behind,
        "conflicted": conflicted,
        "files": files,
    }


def git_add(root: str | Path, paths: list[str]) -> None:
    if not paths:
        raise ValueError("No paths to stage")
    for path in paths:
        if ".." in path or "\0" in path:
            raise ValueError(f"Invalid path: {path}")
    code, _out, err = git_run(root, "add", "--", *paths)
    if code != 0:
        raise RuntimeError(err.strip() or "git add failed")


def git_commit(root: str | Path, message: str) -> str:
    message = (message or "").strip()
    if not message:
        raise ValueError("Commit message is required")
    code, out, err = git_run(root, "commit", "-m", message)
    if code != 0:
        raise RuntimeError(err.strip() or "git commit failed")
    return out.strip()


def git_diff_stat(root: str | Path) -> str:
    code, out, _err = git_run(root, "diff", "--stat", "HEAD")
    if code != 0:
        code2, out2, err2 = git_run(root, "status", "--short")
        if code2 != 0:
            raise RuntimeError(err2.strip() or "git diff failed")
        return out2.strip()
    return out.strip()
