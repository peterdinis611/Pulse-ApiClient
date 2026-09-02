from __future__ import annotations

import html


def _esc(value: object) -> str:
    return html.escape(str(value if value is not None else ""), quote=True)


def to_junit(result: dict, suite_name: str | None = None) -> str:
    name = suite_name or result.get("collectionName") or "pulse"
    steps = result.get("steps") or []
    failures = 0
    cases: list[str] = []
    for index, step in enumerate(steps):
        saved = step.get("saved") or {}
        tests = step.get("testResults") or {}
        case_name = saved.get("name") or f"step-{index + 1}"
        elapsed = ((step.get("response") or {}).get("elapsedMs") or 0) / 1000
        error = step.get("error")
        failed = int(tests.get("failed") or 0)
        if error or failed:
            failures += 1
            message = error or "assertion failed"
            details = error or "\n".join(
                f"{item.get('name')}: {item.get('error')}"
                for item in tests.get("results") or []
                if not item.get("passed")
            )
            body = (
                f'    <testcase name="{_esc(case_name)}" time="{elapsed:.3f}">\n'
                f'      <failure message="{_esc(message)}">{_esc(details)}</failure>\n'
                f"    </testcase>"
            )
        else:
            body = f'    <testcase name="{_esc(case_name)}" time="{elapsed:.3f}"/>'
        cases.append(body)
    xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        f'<testsuite name="{_esc(name)}" tests="{len(steps)}" failures="{failures}">',
        *cases,
        "</testsuite>",
        "",
    ]
    return "\n".join(xml)
