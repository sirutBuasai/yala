"""Where the ledger lives: ``$YALA_LEDGER_DIR``, so no private data location is hardcoded here.

The ledger itself is the source of truth for currency, accounts, and categories — read those from
the loaded ledger rather than adding them to this module.
"""

from __future__ import annotations

import os
from pathlib import Path

_DEFAULT_LEDGER = Path.home() / "personal_dev" / "yala-project" / "yala-private-data" / "ledger"

LEDGER_DIR = Path(os.environ.get("YALA_LEDGER_DIR", _DEFAULT_LEDGER))
MAIN_LEDGER = LEDGER_DIR / "main.beancount"
