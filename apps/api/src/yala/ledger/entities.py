"""Lightweight entity wrappers over beancount datatypes.

These shield the rest of the backend from beancount internals: query methods return
``Transaction`` / ``Posting`` objects rather than raw directives. These types are
**domain-agnostic** — they carry only what's true of any transaction. Domain-specific
derivations (a spending category, an expense amount) live in the domain modules, not here.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field
from decimal import Decimal

from yala.ledger.constants import EXPENSES
from yala.ledger.locators import locator_of


def leaf(account: str) -> str:
    """The last segment of an account path (e.g. ``Assets:Cash:BofA`` → ``BofA``)."""
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
