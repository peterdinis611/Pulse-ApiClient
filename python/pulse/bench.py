from __future__ import annotations

import math
from collections.abc import Callable

from .report import percentile, summarize_run, step_elapsed_ms


def _mean(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def _stddev(values: list[float]) -> float:
    if len(values) < 2:
        return 0.0
    mean = _mean(values)
    variance = sum((item - mean) ** 2 for item in values) / (len(values) - 1)
    return math.sqrt(variance)


def _timing_block(all_ms: list[float]) -> dict:
    return {
        "count": len(all_ms),
        "minMs": min(all_ms) if all_ms else 0,
        "maxMs": max(all_ms) if all_ms else 0,
        "meanMs": round(_mean(all_ms), 2),
        "stddevMs": round(_stddev(all_ms), 2),
        "p50Ms": round(percentile(all_ms, 50), 2),
        "p95Ms": round(percentile(all_ms, 95), 2),
        "p99Ms": round(percentile(all_ms, 99), 2),
    }


def run_bench(run_once, repeats: int, on_repeat: Callable[[int, int, dict], None] | None = None) -> dict:
    if repeats < 1:
        raise ValueError("repeats must be >= 1")
    runs = []
    all_ms: list[float] = []
    run_totals: list[float] = []
    failed_runs = 0
    for index in range(repeats):
        result = run_once()
        summary = summarize_run(result)
        runs.append(summary)
        if on_repeat:
            on_repeat(index + 1, repeats, summary)
        if summary["failed"] or summary["httpErrors"]:
            failed_runs += 1
        step_ms = [
            ms
            for step in result.get("steps") or []
            if (ms := step_elapsed_ms(step)) is not None
        ]
        all_ms.extend(step_ms)
        if step_ms:
            run_totals.append(sum(step_ms))
    success_rate = round((repeats - failed_runs) / repeats, 4) if repeats else 0.0
    timing = _timing_block(all_ms)
    report = {
        "repeats": repeats,
        "failedRuns": failed_runs,
        "successRate": success_rate,
        "ok": failed_runs == 0,
        "timing": timing,
        "runTotals": _timing_block(run_totals),
        "runs": runs,
    }
    return report


def compare_bench(
    current: dict,
    baseline: dict,
    *,
    p95_budget: float | None = None,
    mean_budget: float | None = None,
    factor: float = 1.2,
    max_failed_runs: int | None = 0,
) -> list[str]:
    errors: list[str] = []
    current_timing = current.get("timing") or {}
    baseline_timing = baseline.get("timing") or {}
    current_p95 = float(current_timing.get("p95Ms") or 0)
    baseline_p95 = float(baseline_timing.get("p95Ms") or 0)
    current_mean = float(current_timing.get("meanMs") or 0)
    baseline_mean = float(baseline_timing.get("meanMs") or 0)

    limit = p95_budget
    if limit is None and baseline_p95:
        limit = baseline_p95 * factor
    if limit is not None and current_p95 > limit:
        errors.append(f"p95 {current_p95}ms exceeds budget {round(limit, 2)}ms")

    mean_limit = mean_budget
    if mean_limit is None and baseline_mean:
        mean_limit = baseline_mean * factor
    if mean_limit is not None and current_mean > mean_limit:
        errors.append(f"mean {current_mean}ms exceeds budget {round(mean_limit, 2)}ms")

    failed = int(current.get("failedRuns") or 0)
    if max_failed_runs is not None and failed > max_failed_runs:
        errors.append(f"{failed} bench runs had failing tests or HTTP errors")
    return errors


def format_bench_summary(report: dict) -> str:
    timing = report.get("timing") or {}
    run_totals = report.get("runTotals") or {}
    lines = [
        f"repeats={report.get('repeats')} failedRuns={report.get('failedRuns')} "
        f"successRate={report.get('successRate')} ok={report.get('ok')}",
        (
            f"steps p50={timing.get('p50Ms')}ms p95={timing.get('p95Ms')}ms "
            f"mean={timing.get('meanMs')}ms±{timing.get('stddevMs')} "
            f"min={timing.get('minMs')} max={timing.get('maxMs')} n={timing.get('count')}"
        ),
    ]
    if run_totals.get("count"):
        lines.append(
            f"runTotals p95={run_totals.get('p95Ms')}ms mean={run_totals.get('meanMs')}ms"
        )
    return "\n".join(lines)
