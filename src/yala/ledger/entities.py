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
        """Human funding-source label from the ``src`` meta (e.g. 'Amex Gold')."""
        return self.meta.get("src")

    @property
    def pending(self) -> bool:
        """True for the beancount ``!`` flag — entered but not bank-confirmed."""
        return self.flag == "!"

    def filtered_postings(self, prefix: str) -> list[Posting]:
        """Postings whose account starts with ``prefix`` (e.g. ``'Expenses:'``)."""
        return [p for p in self.postings if p.account.startswith(prefix)]
