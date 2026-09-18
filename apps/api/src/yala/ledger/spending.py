"""Spending domain: discretionary ``Expenses:*`` transactions, meaning everything outside the
``Expenses:Deductions:*`` subtree, payroll deductions belonging to income rather than spending.

**Invariant:** a discretionary spending transaction has exactly one ``Expenses:*`` posting.
"""

from __future__ import annotations

import datetime as dt
from collections import defaultdict
from dataclasses import dataclass
from decimal import Decimal
from typing import TYPE_CHECKING

from yala.dates import Month, month_of
from yala.ledger.constants import DEDUCTIONS, EXPENSES

if TYPE_CHECKING:
    from yala.ledger.core import Ledger


def _is_discretionary(account: str) -> bool:
    return account.startswith(EXPENSES) and not account.startswith(DEDUCTIONS)


@dataclass
class SpendingTransaction:
    """A transaction seen through the spending lens: exactly one category, its expense amount."""

    date: dt.date
    payee: str
    amount: Decimal
    category: str
    source: str | None
    pending: bool
    locator: str
    bill: Decimal | None


class Spending:
    """Query namespace for spending. Constructed as ``ledger.spending``."""

    def __init__(self, ledger: "Ledger"):
        self._led = ledger

    def transactions(
        self,
        year: int | None = None,
        month: int | None = None,
        category: str | None = None,
    ) -> list[SpendingTransaction]:
        out: list[SpendingTransaction] = []

        for t in self._led.transactions(year, month):
            expense_postings = [p for p in t.postings if _is_discretionary(p.account)]

            if not expense_postings:
                continue  # not a spending directive
            if len(expense_postings) > 1:
                raise ValueError(
                    f"spending txn {t.date} {t.payee!r} has "
                    f"{len(expense_postings)} Expenses postings; "
                    "only one category is allowed per transaction."
                )

            expense = expense_postings[0]
            cat = expense.account.split(":", 1)[1]

            if category is not None and cat != category:
                continue

            out.append(
                SpendingTransaction(
                    date=t.date,
                    payee=t.payee,
                    amount=expense.amount,
                    category=cat,
                    source=t.source,
                    pending=t.pending,
                    locator=t.locator,
                    bill=t.bill,
                )
            )
        return out

    def categories(self) -> list[str]:
        """Discretionary categories from *active* ``Expenses:*`` accounts, sorted. A closed category
        drops out so it can't be picked, while historical transactions still report against it."""
        return sorted(
            a.split(":", 1)[1] for a in self._led.active_accounts(EXPENSES) if _is_discretionary(a)
        )

    def by_category(self, year: int | None = None, month: int | None = None) -> dict[str, Decimal]:
        totals: dict[str, Decimal] = defaultdict(lambda: Decimal(0))

        for t in self.transactions(year, month):
            totals[t.category] += t.amount

        return dict(totals)

    def total(self, year: int | None = None, month: int | None = None) -> Decimal:
        return sum(self.by_category(year, month).values(), Decimal(0))

    def count(self) -> int:
        return len(self.transactions())

    def years(self) -> list[int]:
        return sorted({t.date.year for t in self.transactions()})

    def months(self) -> list[Month]:
        return sorted({month_of(t.date) for t in self.transactions()})

    def date_range(self) -> tuple[dt.date, dt.date] | None:
        dates = [t.date for t in self.transactions()]
        return (min(dates), max(dates)) if dates else None
