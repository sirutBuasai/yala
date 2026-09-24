"""Account-path taxonomy: the ledger's account prefixes and meta-key sets.

Postings are classified by account prefix, so these are the single source of truth for what each
account subtree means.
"""

from __future__ import annotations

from collections.abc import Mapping

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
# Per-account plugs that absorb the delta when a balance is re-asserted.
ADJUSTMENTS = EQUITY + "Adjustments:"
OPENING_BALANCES = EQUITY + "Opening-Balances"
INVEST_ADJUSTMENTS = ADJUSTMENTS + "Investments:"

# Currency written onto new account directives.
DEFAULT_CURRENCY = "USD"

# Beancount directive keywords.
OPEN = "open"
CLOSE = "close"
BALANCE = "balance"
PAD = "pad"

SWEEP_META = "sweep_to"
#: Employer an account is scoped to. On an investment it also marks the account payroll-
#: contributable; absent, the account serves every employer.
EMPLOYER_META = "employer"
#: Comma-joined contribution labels an investment account offers.
LABELS_META = "labels"
#: Which of those labels a contribution posting was made under.
LABEL_META = "label"
#: On a card: its bank's current balance counts pending charges. Absent, it leaves them out.
INCLUDES_PENDING_META = "balance_includes_pending"
#: Written on a ``close`` a cascade produced, naming what triggered it, so reopening that account
#: undoes exactly the closes it caused and leaves an independent one alone.
CLOSED_WITH_META = "closed_with"

# Source-location keys beancount injects onto every directive.
INTERNAL_META = frozenset({"filename", "lineno"})
RETIRED_META = frozenset({"src"})  # spreadsheet-import artifact
#: On a pending transaction: it is posted at the bank and pending only until a reimbursement lands.
AWAITING_META = "awaiting"
AWAITING_REIMBURSEMENT = "reimbursement"
MANAGED_META = frozenset({"id", "funding", "bill", AWAITING_META})  # always recomputed
DROPPED_META = INTERNAL_META | RETIRED_META | MANAGED_META


def meta_str(meta: Mapping[str, object] | None, key: str) -> str | None:
    """One metadata value as text, or ``None`` when it is absent or empty.

    The one reader for every optional meta key: beancount hands values back untyped, and an empty
    string has to read the same as a missing key, or a cleared field would look like a set one.
    """
    value = (meta or {}).get(key)

    return str(value) if value else None


def awaits_reimbursement(meta: Mapping[str, object] | None) -> bool:
    return meta_str(meta, AWAITING_META) == AWAITING_REIMBURSEMENT
