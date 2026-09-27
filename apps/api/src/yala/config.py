"""Paths from ``$YALA_LEDGER_DIR`` and ``$YALA_WEB_DIR``. Currency, accounts and categories come
from the ledger, never from here."""

from __future__ import annotations

import os
from pathlib import Path

_DEFAULT_LEDGER = Path.home() / "personal_dev" / "yala-project" / "yala-private-data" / "ledger"

LEDGER_DIR = Path(os.environ.get("YALA_LEDGER_DIR", _DEFAULT_LEDGER))
MAIN_LEDGER = LEDGER_DIR / "main.beancount"

# Resolving ".." clamps at "/" where `parents[n]` raises, so importing works outside a checkout (the
# container image), which sets the env vars instead.
REPO_ROOT = Path(__file__, "../../../../..").resolve()

WEB_DIR = Path(os.environ.get("YALA_WEB_DIR", REPO_ROOT / "apps" / "web" / "build"))
