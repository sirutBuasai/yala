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
INVEST_TAXABLE = INVESTMENTS + "Taxable:"
INVEST_TAX_ADVANTAGED = INVESTMENTS + "TaxAdvantaged:"
CASH = ASSETS + "Cash:"
CREDIT_CARDS = LIABILITIES + "CC:"
# Per-account plug accounts that absorb monthly re-assertion deltas (the two-tier snapshot model).
ADJUSTMENTS = EQUITY + "Adjustments:"
INVEST_ADJUSTMENTS = ADJUSTMENTS + "Investments:"

# The default posting currency written onto new account directives.
DEFAULT_CURRENCY = "USD"

# Beancount directive keywords (see yala.ledger.sweep for passthrough sweeps).
OPEN = "open"
CLOSE = "close"
BALANCE = "balance"

SWEEP_META = "sweep_to"
VENMO = CASH + "Venmo"
VENMO_PASSTHROUGH = CASH + "Wealthfront"
SWEEP_PAYEE = "venmo sweep"

# Source-location keys beancount injects onto every directive.
INTERNAL_META = frozenset({"filename", "lineno"})
RETIRED_META = frozenset({"src"})  # spreadsheet-import artifact
MANAGED_META = frozenset({"id", "funding", "bill"})  # always recomputed
# Meta keys never carried onto an edited entry.
DROPPED_META = INTERNAL_META | RETIRED_META | MANAGED_META
