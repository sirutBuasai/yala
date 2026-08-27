"""Income domain: paycheck transactions.

A paycheck is a transaction with an ``Income:*`` posting. Postings are classified by **prefix**,
not hardcoded names, so beancount stays the source of truth — adding
``Expenses:Deductions:Vision`` or ``Assets:Investments:Brokerage`` is picked up automatically:

* ``Expenses:Deductions:*`` — direct money out (tax, insurance): truly gone.
* ``Assets:Investments:*``  — indirect money out (HSA, 401k): still yours, invested.
* everything else           — take-home cash, the remainder.

Two headline figures: **net** = gross − direct out (money that stayed yours); **take-home**
= gross − all out (cash deposited to the bank, = net − indirect out).
"""

from __future__ import annotations

import datetime as dt
from collections import defaultdict
from dataclasses import dataclass
from decimal import Decimal
from typing import TYPE_CHECKING

from yala.ledger.entities import INCOME
from yala.ledger.payroll import summarize_paycheck

if TYPE_CHECKING:
    from yala.ledger.core import Ledger


@dataclass
class Paycheck:
    date: dt.date
    gross: Decimal
    deductions: dict[str, Decimal]
    contributions: dict[str, Decimal]
    locator: str = ""
    payee: str = "paycheck"
    employer: str | None = None

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
        account_meta = self._led.account_meta()

        for t in self._led.transactions(year, month):
            if not any(p.account.startswith(INCOME) for p in t.postings):
                continue

            s = summarize_paycheck(
                ((p.account, p.amount, p.meta.get("label")) for p in t.postings), account_meta
            )
            out.append(
                Paycheck(
                    t.date,
                    s.gross,
                    s.deductions,
                    s.contributions,
                    t.locator,
                    t.payee or "paycheck",
                    s.employer,
                )
            )

        return out

    def gross(self, year: int | None = None, month: int | None = None) -> Decimal:
        return sum((p.gross for p in self.paychecks(year, month)), Decimal(0))

    def net(self, year: int | None = None, month: int | None = None) -> Decimal:
        return sum((p.net for p in self.paychecks(year, month)), Decimal(0))

    def take_home(self, year: int | None = None, month: int | None = None) -> Decimal:
        return sum((p.take_home for p in self.paychecks(year, month)), Decimal(0))

    def _sum_by_key(self, attr: str, year: int | None, month: int | None) -> dict[str, Decimal]:
        """Sum a per-paycheck ``{leaf: amount}`` map (``deductions``/``contributions``) by key."""
        totals: dict[str, Decimal] = defaultdict(lambda: Decimal(0))

        for p in self.paychecks(year, month):
            for k, v in getattr(p, attr).items():
                totals[k] += v

        return dict(totals)

    def deductions(self, year: int | None = None, month: int | None = None) -> dict[str, Decimal]:
        return self._sum_by_key("deductions", year, month)

    def contributions(
        self, year: int | None = None, month: int | None = None
    ) -> dict[str, Decimal]:
        return self._sum_by_key("contributions", year, month)

    def years(self) -> list[int]:
        return sorted({p.date.year for p in self.paychecks()})

    def by_month(self, year: int) -> list[Decimal]:
        """Net (money that stayed yours) per month — 12 values, index 0 = January."""
        totals = [Decimal(0)] * 12
        for p in self.paychecks(year):
            totals[p.date.month - 1] += p.net
        return totals
