"""The ledger module — everything for reading and querying the beancount ledger.

This is the single home for ledger-related code. The ``Ledger`` class is the in-memory
representation of the beancount ledger (the source of truth) and carries the query
functions the rest of the backend builds on: list transactions with filters, aggregate
spending by category, and summarize. ``Transaction`` / ``Posting`` are lightweight views
over beancount's directives so callers don't touch beancount internals directly.

Aggregation is done in plain Python over the loaded directives — no BQL dependency yet;
that arrives with the data.json builder.
"""

from __future__ import annotations

import datetime as dt
from collections import defaultdict
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path

from beancount import loader
from beancount.core import data

from yala import config


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

    @property
    def category(self) -> str | None:
        for p in self.postings:
            if p.account.startswith("Expenses:"):
                return p.account.split(":", 1)[1]
        return None

    @property
    def amount(self) -> Decimal:
        """Signed expense amount (sum of Expenses postings)."""
        return sum((p.amount for p in self.postings if p.account.startswith("Expenses:")), Decimal(0))

    @property
    def source(self) -> str | None:
        return self.meta.get("src")


class Ledger:
    """In-memory representation of the beancount ledger, with query helpers."""

    def __init__(self, path: Path | None = None):
        self.path = Path(path) if path else config.MAIN_LEDGER
        self._entries: list = []
        self.errors: list = []
        self._loaded = False

    def load(self) -> "Ledger":
        if not self.path.exists():
            raise FileNotFoundError(f"Ledger not found: {self.path}")
        entries, errors, _ = loader.load_file(str(self.path))
        self._entries = entries
        self.errors = errors
        self._loaded = True
        return self

    def _require(self):
        if not self._loaded:
            self.load()

    def transactions(
        self, year: int | None = None, month: int | None = None, category: str | None = None
    ) -> list[Transaction]:
        self._require()
        out: list[Transaction] = []
        for e in self._entries:
            if not isinstance(e, data.Transaction):
                continue
            if year is not None and e.date.year != year:
                continue
            if month is not None and e.date.month != month:
                continue
            # NB: `if p.units` would drop zero-amount postings (beancount's Amount is
            # falsy at 0), so test against None explicitly.
            postings = [Posting(p.account, p.units.number) for p in e.postings if p.units is not None]
            txn = Transaction(date=e.date, payee=e.payee or e.narration or "", postings=postings, meta=dict(e.meta or {}))
            if category is not None and txn.category != category:
                continue
            out.append(txn)
        out.sort(key=lambda t: t.date)
        return out

    def category_totals(self, year: int | None = None, month: int | None = None) -> dict[str, Decimal]:
        totals: dict[str, Decimal] = defaultdict(lambda: Decimal(0))
        for t in self.transactions(year=year, month=month):
            if t.category:
                totals[t.category] += t.amount
        return dict(totals)

    def total_spending(self, year: int | None = None, month: int | None = None) -> Decimal:
        return sum(self.category_totals(year, month).values(), Decimal(0))

    def count(self) -> int:
        self._require()
        return sum(1 for e in self._entries if isinstance(e, data.Transaction))

    def years(self) -> list[int]:
        self._require()
        return sorted({e.date.year for e in self._entries if isinstance(e, data.Transaction)})
