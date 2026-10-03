"""Two-leg transactions between ``Assets:*`` and ``Liabilities:*`` only, so a transfer never
double-counts as spending or income."""

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
    #: A passthrough sweep, which the ledger re-derives and refuses to edit or delete by hand.
    auto_managed: bool = False


class Transfers:
    def __init__(self, ledger: "Ledger"):
        self._led = ledger

    def transactions(self, year: int | None = None, month: int | None = None) -> list[Transfer]:
        from yala.ledger.sweep import sweep_pairs

        out: list[Transfer] = []
        sweeps = sweep_pairs(self._led)

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
                    auto_managed=frozenset((outflow.account, inflow.account)) in sweeps,
                )
            )

        return out
