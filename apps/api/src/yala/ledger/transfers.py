"""Transfers domain: money moved between the owner's own accounts.

A transfer is a two-leg transaction whose postings are all ``Assets:*`` / ``Liabilities:*`` — no
``Income``/``Expenses`` (those are paychecks and spending) and no ``Equity`` (those are the
synthetic ``pad`` legs). Bill payments (cash → credit card) and cash sweeps land here; the
spending and income domains ignore them, so a transfer never double-counts as either.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass
from decimal import Decimal
from typing import TYPE_CHECKING

from yala.ledger.constants import ASSETS, LIABILITIES

if TYPE_CHECKING:
    from yala.ledger.core import Ledger


def _is_own_account(account: str) -> bool:
    return account.startswith(ASSETS) or account.startswith(LIABILITIES)


@dataclass
class Transfer:
    date: dt.date
    payee: str
    amount: Decimal  # magnitude moved (the inflow leg)
    from_account: str  # the account money left (outflow leg)
    to_account: str  # the account money entered (inflow leg)
    pending: bool
    locator: str


class Transfers:
    """Query namespace for transfers. Constructed as ``ledger.transfers``."""

    def __init__(self, ledger: "Ledger"):
        self._led = ledger

    def transactions(self, year: int | None = None, month: int | None = None) -> list[Transfer]:
        out: list[Transfer] = []

        for t in self._led.transactions(year, month):
            if len(t.postings) != 2:
                continue
            if not all(_is_own_account(p.account) for p in t.postings):
                continue

            outflow, inflow = sorted(t.postings, key=lambda p: p.amount)
            if outflow.amount >= 0 or inflow.amount <= 0:
                continue

            out.append(
                Transfer(
                    date=t.date,
                    payee=t.payee,
                    amount=inflow.amount,
                    from_account=outflow.account,
                    to_account=inflow.account,
                    pending=t.pending,
                    locator=t.locator,
                )
            )

        return out
