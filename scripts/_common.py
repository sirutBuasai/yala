"""Shared helpers for the workflow scripts (run via ``make`` → ``python3 scripts/<name>.py``)."""

from __future__ import annotations

import io
import shutil
import subprocess
import sys
from pathlib import Path

# Keep our prints ordered relative to subprocess output even when stdout is a pipe (make/CI).
if isinstance(sys.stdout, io.TextIOWrapper):
    sys.stdout.reconfigure(line_buffering=True)

# scripts/ is a repo-root child; the backend venv (created by bootstrap) lives at the repo root.
ROOT = Path(__file__).resolve().parents[1]
VENV_PY = ROOT / ".venv" / "bin" / "python"
WEB = ROOT / "apps" / "web"


def run(*cmd: object, cwd: Path | None = None) -> None:
    """Echo and run a command; exit with its return code if it fails."""
    where = f"  (in {cwd})" if cwd else ""
    # flush so our echoed line stays ordered relative to the subprocess's own output.
    print(f"$ {' '.join(str(c) for c in cmd)}{where}", flush=True)
    result = subprocess.run([str(c) for c in cmd], cwd=str(cwd) if cwd else None, check=False)
    if result.returncode != 0:
        sys.exit(result.returncode)


def rmtree(*paths: Path) -> None:
    """Remove directories if present (no error if missing)."""
    for p in paths:
        shutil.rmtree(p, ignore_errors=True)
