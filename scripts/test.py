#!/usr/bin/env python3
"""Run test suites: test.py api | web | all"""

from __future__ import annotations

import sys

from _common import ROOT, VENV_PY, WEB, run


def run_api() -> None:
    print("==> Backend tests (pytest)")
    run(VENV_PY, "-m", "pytest", cwd=ROOT / "apps" / "api")


def run_web() -> None:
    print("==> Frontend tests (vitest)")
    run("npm", "run", "test", cwd=WEB)


def main(argv: list[str]) -> None:
    target = argv[0] if argv else "all"
    if target == "api":
        run_api()
    elif target == "web":
        run_web()
    elif target == "all":
        run_api()
        run_web()
    else:
        print(
            f"unknown test target: '{target}' (use 'api', 'web', or 'all')",
            file=sys.stderr,
        )
        sys.exit(2)


if __name__ == "__main__":
    main(sys.argv[1:])
