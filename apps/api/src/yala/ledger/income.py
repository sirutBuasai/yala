"""Income domain: paycheck transactions.

A paycheck is a transaction with an ``Income:*`` posting. Postings are classified by **prefix**
(not hardcoded account names) so beancount is the source of truth — add
``Expenses:Deductions:Vision`` or ``Assets:Investments:Brokerage`` and it's picked up
automatically, exactly like ``Spending.categories()`` reads the declared ``Expenses:*`` accounts:

    Income:*                 -gross     ; total in
    Expenses:Deductions:*     ...        ; direct money out (tax, insurance) — truly gone
    Assets:Investments:*      ...        ; indirect money out (HSA, 401k) — still yours, invested
    (everything else)                    ; take-home cash — derived as the remainder

Two headline figures:

* **net**       = gross − direct out — the money that stayed yours.
* **take-home** = gross − all out     — the cash deposited to the bank (= net − indirect out).
"""

from __future__ import annotations

import datetime as dt
from collections import defaultdict
from dataclasses import dataclass
from decimal import Decimal
from typing import TYPE_CHECKING

from yala.ledger.entities import DEDUCTIONS, INCOME, INVESTMENTS

if TYPE_CHECKING:
    from yala.ledger.core import Ledger


def _leaf(account: str) -> str:
    return account.split(":")[-1]


@dataclass
class Paycheck:
    date: dt.date
    gross: Decimal
    deductions: dict[str, Decimal]
    contributions: dict[str, Decimal]
    locator: str = ""

    @property
    def direct_out(self) -> Decimal:
        """Money truly gone (all deductions: tax, insurance, …)."""
        return sum(self.deductions.values(), Decimal(0))

    @property
    def indirect_out(self) -> Decimal:
        """Money moved into your investments (all contributions: HSA, 401k, …)."""
        return sum(self.contributions.values(), Decimal(0))

    @property
    def net(self) -> Decimal:
        """gross − direct out — money that stayed yours (cash + investments)."""
        return self.gross - self.direct_out

    @property
    def take_home(self) -> Decimal:
        """gross − all out — the cash actually deposited."""
        return self.net - self.indirect_out


class Income:
    """Query namespace for income. Constructed as ``ledger.income``."""

    def __init__(self, ledger: "Ledger"):
        self._led = ledger

    def paychecks(self, year: int | None = None, month: int | None = None) -> list[Paycheck]:
        out: list[Paycheck] = []

        for t in self._led.transactions(year, month):
            if not any(p.account.startswith(INCOME) for p in t.postings):
                continue

            gross = Decimal(0)
            deductions: dict[str, Decimal] = defaultdict(lambda: Decimal(0))
            contributions: dict[str, Decimal] = defaultdict(lambda: Decimal(0))

            for p in t.postings:
                if p.account.startswith(INCOME):
                    gross += -p.amount  # Income postings are credits (negative)

                elif p.account.startswith(DEDUCTIONS):
                    deductions[_leaf(p.account)] += p.amount

                elif p.account.startswith(INVESTMENTS):
                    contributions[_leaf(p.account)] += p.amount

            out.append(Paycheck(t.date, gross, dict(deductions), dict(contributions), t.locator))

        return out

    def deduction_categories(self) -> list[str]:
        """Deduction types from the declared ``Expenses:Deductions:*`` accounts, sorted."""
        return sorted(_leaf(a) for a in self._led.declared_accounts(DEDUCTIONS))

    def contribution_categories(self) -> list[str]:
        """Contribution types from the declared ``Assets:Investments:*`` accounts, sorted."""
        return sorted(_leaf(a) for a in self._led.declared_accounts(INVESTMENTS))

    def gross(self, year: int | None = None, month: int | None = None) -> Decimal:
        return sum((p.gross for p in self.paychecks(year, month)), Decimal(0))

    def net(self, year: int | None = None, month: int | None = None) -> Decimal:
        return sum((p.net for p in self.paychecks(year, month)), Decimal(0))

    def take_home(self, year: int | None = None, month: int | None = None) -> Decimal:
        return sum((p.take_home for p in self.paychecks(year, month)), Decimal(0))

    def deductions(self, year: int | None = None, month: int | None = None) -> dict[str, Decimal]:
        totals: dict[str, Decimal] = defaultdict(lambda: Decimal(0))

        for p in self.paychecks(year, month):
            for k, v in p.deductions.items():
                totals[k] += v

        return dict(totals)

    def contributions(
        self, year: int | None = None, month: int | None = None
    ) -> dict[str, Decimal]:
        totals: dict[str, Decimal] = defaultdict(lambda: Decimal(0))

        for p in self.paychecks(year, month):
            for k, v in p.contributions.items():
                totals[k] += v

        return dict(totals)

    def years(self) -> list[int]:
        return sorted({p.date.year for p in self.paychecks()})

    def by_month(self, year: int) -> list[Decimal]:
        """Net (money that stayed yours) per month — 12 values, index 0 = January."""
        totals = [Decimal(0)] * 12
        for p in self.paychecks(year):
            totals[p.date.month - 1] += p.net
        return totals
