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

# A passthrough account holds no money of its own — every dollar through it is pulled from or
# pushed to a destination declared as ``sweep_to`` meta on its ``open``. Venmo → Wealthfront is the
# canonical instance. The backend keeps each passthrough balanced to zero with one auto-maintained
# monthly sweep transfer to its (transitively resolved) destination (see yala.ledger.sweep).
SWEEP_META = "sweep_to"
VENMO = CASH + "Venmo"
VENMO_PASSTHROUGH = CASH + "Wealthfront"
SWEEP_PAYEE = "venmo sweep"

# Source-location keys beancount injects onto every directive's meta (not our data).
INTERNAL_META = frozenset({"filename", "lineno"})
RETIRED_META = frozenset({"src"})  # spreadsheet-import artifact, dropped on edit
MANAGED_META = frozenset({"id", "funding", "bill"})  # we always (re)compute these
# Meta keys we never carry forward onto an edited entry (recomputed or internal).
DROPPED_META = INTERNAL_META | RETIRED_META | MANAGED_META
