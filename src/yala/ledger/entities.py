"""Lightweight entity wrappers over beancount datatypes.

These shield the rest of the backend from beancount internals: query methods return
``Transaction`` / ``Posting`` objects rather than raw directives. These types are
**domain-agnostic** — they carry only what's true of any transaction. Domain-specific
derivations (a spending category, an expense amount) live in the domain modules, not here.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass
from decimal import Decimal

EXPENSES = "Expenses:"
DEDUCTIONS = EXPENSES + "Deductions:"
INCOME = "Income:"
INVESTMENTS = "Assets:Investments:"


@dataclass
class Posting:
    account: str
    amount: Decimal


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
        uid = self.meta.get("id")

        if uid:
            return f"id:{uid}"

        return f"line:{self.meta['filename']}:{self.meta['lineno']}"

    @property
    def pending(self) -> bool:
        """True for the beancount ``!`` flag — entered but not bank-confirmed."""
        return self.flag == "!"

    def filtered_postings(self, prefix: str) -> list[Posting]:
        """Postings whose account starts with ``prefix`` (e.g. ``'Expenses:'``)."""
        return [p for p in self.postings if p.account.startswith(prefix)]
