#!/usr/bin/env python3
"""Writes ``packages/contract/data.schema.json``, committed so the frontend never hand-maintains the
contract."""

from __future__ import annotations

import json
from pathlib import Path

from yala import schema

# The shared contract lives in packages/contract at the repo root (scripts/ is a repo-root child).
OUT = Path(__file__).resolve().parents[1] / "packages" / "contract"


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "data.schema.json").write_text(json.dumps(schema.json_schema(), indent=2) + "\n")
    print(f"wrote {OUT / 'data.schema.json'}")


if __name__ == "__main__":
    main()
