"""Account-path taxonomy: the ledger's account prefixes and meta-key sets.

Postings are classified by account prefix, so these are the single source of truth for what each
account subtree means; the meta-key sets track which entry metadata we own versus inherit.
"""

from __future__ import annotations

EXPENSES = "Expenses:"
DEDUCTIONS = EXPENSES + "Deductions:"
INCOME = "Income:"
SALARY = INCOME + "Salary:"
ASSETS = "Assets:"
LIABILITIES = "Liabilities:"
EQUITY = "Equity:"
INVESTMENTS = ASSETS + "Investments:"
CASH = ASSETS + "Cash:"
CREDIT_CARDS = LIABILITIES + "CC:"

# Venmo is a passthrough for Wealthfront: money in/out of Venmo is really pulled from or pushed to
# Wealthfront. The backend keeps Venmo balanced to zero each month with a single auto-maintained
# sweep transfer between these two accounts (see yala.ledger.venmo_sweep).
VENMO = CASH + "Venmo"
VENMO_PASSTHROUGH = CASH + "Wealthfront"
SWEEP_PAYEE = "venmo sweep"

# Source-location keys beancount injects onto every directive's meta (not our data).
INTERNAL_META = frozenset({"filename", "lineno"})
RETIRED_META = frozenset({"src"})  # spreadsheet-import artifact, dropped on edit
MANAGED_META = frozenset({"id", "funding", "bill"})  # we always (re)compute these
# Meta keys we never carry forward onto an edited entry (recomputed or internal).
DROPPED_META = INTERNAL_META | RETIRED_META | MANAGED_META
