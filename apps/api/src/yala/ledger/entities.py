"""Lightweight entity wrappers that keep beancount internals out of the rest of the backend.

These types are **domain-agnostic** — they carry only what is true of any transaction; domain
derivations belong in the domain modules.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field
from decimal import Decimal

from yala.ledger.constants import EXPENSES
from yala.ledger.locators import locator_of


def leaf(account: str) -> str:
    """The last segment of an account path."""
    return account.split(":")[-1]


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
        """Funding account: the ``funding`` meta, else the most-negative non-expense leg."""
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
