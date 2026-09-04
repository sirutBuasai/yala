"""Configuration: where the ledger lives.

Resolves from an environment variable so the public code repo never hardcodes a private
data location:

  YALA_LEDGER_DIR   where the .beancount files live   (default: ../yala-private-data/ledger)

The ledger itself is the source of truth for currency (``option "operating_currency"``),
accounts, and categories (the ``Expenses:*`` accounts). Read those from the loaded ledger
rather than duplicating them here.
"""

from __future__ import annotations

import os
from pathlib import Path

_DEFAULT_LEDGER = Path.home() / "personal_dev" / "yala-project" / "yala-private-data" / "ledger"

LEDGER_DIR = Path(os.environ.get("YALA_LEDGER_DIR", _DEFAULT_LEDGER))
MAIN_LEDGER = LEDGER_DIR / "main.beancount"
