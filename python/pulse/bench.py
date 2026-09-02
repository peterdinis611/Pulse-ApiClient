from __future__ import annotations

from .report import percentile, summarize_run, step_elapsed_ms


def run_bench(run_once, repeats: int) -> dict:
    if repeats < 1:
        raise ValueError("repeats must be >= 1")
    runs = []
    all_ms: list[float] = []
    failed_runs = 0
    for index in range(repeats):
        result = run_once()
        summary = summarize_run(result)
        runs.append(summary)
        if summary["failed"] or summary["httpErrors"]:
            failed_runs += 1
        all_ms.extend(
            ms
            for step in result.get("steps") or []
            if (ms := step_elapsed_ms(step)) is not None
        )
    return {
        "repeats": repeats,
        "failedRuns": failed_runs,
        "timing": {
            "count": len(all_ms),
            "minMs": min(all_ms) if all_ms else 0,
            "maxMs": max(all_ms) if all_ms else 0,
            "p50Ms": round(percentile(all_ms, 50), 2),
            "p95Ms": round(percentile(all_ms, 95), 2),
            "p99Ms": round(percentile(all_ms, 99), 2),
        },
        "runs": runs,
    }


def compare_bench(current: dict, baseline: dict, *, p95_budget: float | None = None, factor: float = 1.2) -> list[str]:
    errors: list[str] = []
    current_p95 = float((current.get("timing") or {}).get("p95Ms") or 0)
    baseline_p95 = float((baseline.get("timing") or {}).get("p95Ms") or 0)
    limit = p95_budget
    if limit is None and baseline_p95:
        limit = baseline_p95 * factor
    if limit is not None and current_p95 > limit:
        errors.append(f"p95 {current_p95}ms exceeds budget {round(limit, 2)}ms")
    if current.get("failedRuns"):
        errors.append(f"{current['failedRuns']} bench runs had failing tests or HTTP errors")
    return errors
