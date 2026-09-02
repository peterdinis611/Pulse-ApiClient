from __future__ import annotations


def load_native():
    try:
        import pulse_native
    except ImportError as error:
        raise SystemExit(
            "pulse_native is not installed. From repo root run:\n"
            "  bun run pulse:cli:install"
        ) from error
    if not hasattr(pulse_native, "send_once_json"):
        raise SystemExit(
            "pulse_native is outdated. Rebuild with:\n"
            "  bun run pulse:cli:install"
        )
    return pulse_native
