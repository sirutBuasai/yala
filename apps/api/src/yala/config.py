"""Where the ledger lives: ``$YALA_LEDGER_DIR``, so no private data location is hardcoded here.
Where the built site lives: ``$YALA_WEB_DIR``, defaulting to this checkout's ``apps/web/build``.

The ledger itself is the source of truth for currency, accounts, and categories — read those from
the loaded ledger rather than adding them to this module.
"""

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
