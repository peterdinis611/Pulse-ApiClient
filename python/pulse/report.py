from __future__ import annotations


def percentile(values: list[float], pct: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    if len(ordered) == 1:
        return float(ordered[0])
    rank = (len(ordered) - 1) * (pct / 100)
    low = int(rank)
    high = min(low + 1, len(ordered) - 1)
    weight = rank - low
    return ordered[low] * (1 - weight) + ordered[high] * weight


def step_elapsed_ms(step: dict) -> float | None:
    response = step.get("response")
    if not isinstance(response, dict):
        return None
    value = response.get("totalMs")
    if value is None:
        value = response.get("elapsedMs")
    return float(value) if value is not None else None


def summarize_run(result: dict) -> dict:
    steps = result.get("steps") or []
    timings = [ms for step in steps if (ms := step_elapsed_ms(step)) is not None]
    failures = []
    for step in steps:
        if step.get("error") or int((step.get("testResults") or {}).get("failed") or 0):
            failures.append(
                {
                    "name": (step.get("saved") or {}).get("name"),
                    "error": step.get("error"),
                    "failed": (step.get("testResults") or {}).get("failed"),
                }
            )
    slowest = sorted(
        (
            {"name": (step.get("saved") or {}).get("name"), "ms": ms}
            for step in steps
            if (ms := step_elapsed_ms(step)) is not None
        ),
        key=lambda item: item["ms"],
        reverse=True,
    )[:5]
    http_errors = sum(1 for step in steps if step.get("error"))
    return {
        "collection": result.get("collectionName"),
        "requests": len(steps),
        "passed": result.get("passed") or 0,
        "failed": result.get("failed") or 0,
        "httpErrors": http_errors,
        "iterations": result.get("iterations") or 1,
        "timing": {
            "count": len(timings),
            "minMs": min(timings) if timings else 0,
            "maxMs": max(timings) if timings else 0,
            "meanMs": round(sum(timings) / len(timings), 2) if timings else 0,
            "p50Ms": round(percentile(timings, 50), 2),
            "p95Ms": round(percentile(timings, 95), 2),
            "p99Ms": round(percentile(timings, 99), 2),
        },
        "slowest": slowest,
        "failures": failures,
    }
