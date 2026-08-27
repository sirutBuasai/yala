"""Lightweight entity wrappers over beancount datatypes.

These shield the rest of the backend from beancount internals: query methods return
``Transaction`` / ``Posting`` objects rather than raw directives. These types are
**domain-agnostic** — they carry only what's true of any transaction. Domain-specific
derivations (a spending category, an expense amount) live in the domain modules, not here.
"""

from __future__ import annotations

import datetime as dt
import os
from dataclasses import dataclass, field
from decimal import Decimal

from yala import config

EXPENSES = "Expenses:"
DEDUCTIONS = EXPENSES + "Deductions:"
INCOME = "Income:"
SALARY = INCOME + "Salary:"
ASSETS = "Assets:"
LIABILITIES = "Liabilities:"
EQUITY = "Equity:"
INVESTMENTS = ASSETS + "Investments:"

# Source-location keys beancount injects onto every directive's meta (not our data).
INTERNAL_META = frozenset({"filename", "lineno"})
RETIRED_META = frozenset({"src"})  # spreadsheet-import artifact, dropped on edit
MANAGED_META = frozenset({"id", "funding", "bill"})  # we always (re)compute these
# Meta keys we never carry forward onto an edited entry (recomputed or internal).
DROPPED_META = INTERNAL_META | RETIRED_META | MANAGED_META


def leaf(account: str) -> str:
    """The last segment of an account path."""
    return account.split(":")[-1]


def ledger_relative(filename: str) -> str:
    """A ledger-relative path, so a private absolute path never leaks into ``data.json``.

    beancount stamps entries with the absolute source path; emitting that verbatim in a
    ``line:`` locator would embed e.g. ``/Users/<owner>/.../ledger`` in the public snapshot.
    Falls back to the original path when it can't be made relative (outside the ledger dir,
    or a different drive on Windows)."""
    base = str(config.LEDGER_DIR)
    try:
        rel = os.path.relpath(filename, base)
        if not rel.startswith(".."):
            return rel

        # A lexical relpath breaks when the paths differ only by a symlink (e.g. a macOS temp
        # dir surfacing as both /var and /private/var); retry against the canonical paths.
        rel = os.path.relpath(os.path.realpath(filename), os.path.realpath(base))
    except ValueError:
        return filename

    return filename if rel.startswith("..") else rel


def locator_of(meta: dict | None) -> str:
    """Stable edit handle from an entry's meta: ``id:<uuid>`` if present, else
    ``line:<ledger-relative-path>:<lineno>``. Shared by the entity view and the raw-entry
    sink helpers."""
    meta = meta or {}
    uid = meta.get("id")

    if uid:
        return f"id:{uid}"

    return f"line:{ledger_relative(meta['filename'])}:{meta['lineno']}"


@dataclass
class Posting:
    account: str
    amount: Decimal
    meta: dict = field(default_factory=dict)


@dataclass
class Transaction:
    date: dt.date
    payee: str
    postings: list[Posting]
    meta: dict
    flag: str = "*"

    @property
    def source(self) -> str | None:
        """Funding account: the account that paid for txn."""
        funding = self.meta.get("funding")

        if funding:
            return funding

        non_expense = [p for p in self.postings if not p.account.startswith(EXPENSES)]

        if not non_expense:
            return None

        return min(non_expense, key=lambda p: p.amount).account

    @property
    def bill(self) -> Decimal | None:
        """Pre-reimbursement total from the ``bill`` meta, when the txn was split with others."""
        value = self.meta.get("bill")

        if value is None:
            return None

        return getattr(value, "number", value)

    @property
    def locator(self) -> str:
        """Stable handle for edits: ``id:<uuid>`` if the entry has an id, else
        ``line:<path>:<n>``."""
        return locator_of(self.meta)

    @property
    def pending(self) -> bool:
        """True for the beancount ``!`` flag — entered but not bank-confirmed."""
        return self.flag == "!"
