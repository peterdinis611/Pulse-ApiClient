#!/usr/bin/env python3
"""Convert an OpenAPI 3 JSON/YAML spec into a Pulse collection export."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pulse.openapi import main

if __name__ == "__main__":
    raise SystemExit(main())
