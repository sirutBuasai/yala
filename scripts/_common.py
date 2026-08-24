"""Shared helpers for the workflow scripts (run via ``make`` → ``python3 scripts/<name>.py``)."""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

# scripts/ is a repo-root child; the backend venv (created by bootstrap) lives at the repo root.
ROOT = Path(__file__).resolve().parents[1]
VENV_PY = ROOT / ".venv" / "bin" / "python"
WEB = ROOT / "apps" / "web"


def run(*cmd: object, cwd: Path | None = None) -> None:
    """Echo and run a command; exit with its return code if it fails."""
    where = f"  (in {cwd})" if cwd else ""
    print(f"$ {' '.join(str(c) for c in cmd)}{where}")
    result = subprocess.run([str(c) for c in cmd], cwd=str(cwd) if cwd else None, check=False)
    if result.returncode != 0:
        sys.exit(result.returncode)


def rmtree(*paths: Path) -> None:
    """Remove directories if present (no error if missing)."""
    for p in paths:
        shutil.rmtree(p, ignore_errors=True)
