"""Net-worth domain: assets − liabilities over time, derived from ``balance`` snapshots.

Net worth is never stored: it's ``Assets`` (cash + investments valued at price) minus
``Liabilities`` (credit cards, taxes owed), read at each month's ``balance`` assertion. Snapshots
are logged as ``pad`` + ``balance`` pairs (see :meth:`FileLedgerSink.log_balance`); the ``pad``
routes each account's untracked delta to its own ``Equity:Adjustments:*`` plug, which this domain
surfaces as a per-account sanity check on flows that were never entered as transactions.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass
from decimal import Decimal
from typing import TYPE_CHECKING

from beancount.core import data

from yala.ledger.constants import (
    ADJUSTMENTS,
    ASSETS,
    CASH,
    INVEST_TAX_ADVANTAGED,
    INVEST_TAXABLE,
    INVESTMENTS,
    LIABILITIES,
)
from yala.ledger.entities import leaf
from yala.money import round_cents

if TYPE_CHECKING:
    from yala.ledger.core import Ledger


def adjustment_account(account: str) -> str:
    """The ``Equity:Adjustments:*`` plug account paired with snapshots of ``account``.

    Cash keeps its leaf (``Assets:Cash:Ally`` → ``Equity:Adjustments:Ally``); investments drop the
    tax tier so both trees share one plug (``Assets:Investments:Taxable:Schwab`` →
    ``Equity:Adjustments:Investments:Schwab``). Raises for anything else."""
    if account.startswith(CASH):
        return ADJUSTMENTS + account[len(CASH) :]
    if account.startswith(INVEST_TAXABLE):
        return ADJUSTMENTS + "Investments:" + account[len(INVEST_TAXABLE) :]
    if account.startswith(INVEST_TAX_ADVANTAGED):
        return ADJUSTMENTS + "Investments:" + account[len(INVEST_TAX_ADVANTAGED) :]
    raise ValueError(f"no adjustment account for {account}")


# Allocation buckets — how an asset account contributes to the "where's my money" split, in
# display order. Mirrors the net-worth spreadsheet's Liquid / Taxable / Tax-advantaged grouping.
BUCKETS = ("Liquid", "Taxable", "Tax-advantaged")


def bucket(account: str) -> str:
    """The allocation bucket an asset account falls into (``BUCKETS``)."""
    if account.startswith(INVEST_TAXABLE):
        return "Taxable"
    if account.startswith(INVEST_TAX_ADVANTAGED):
        return "Tax-advantaged"
    return "Liquid"  # cash, gift cards, receivables — the spendable / non-invested pool


@dataclass
class AccountValue:
    """One account's USD value at a point in time, tagged with its group and allocation bucket."""

    account: str
    label: str
    group: str  # "cash" | "investment" | "liability"
    bucket: str  # allocation bucket (assets only; liabilities repeat their group)
    value: Decimal


@dataclass
class NetWorthSnapshot:
    """A net-worth snapshot for one month: assets, liabilities (positive drag), net, and the asset
    split across allocation buckets."""

    month: str  # "YYYY-MM"
    assets: Decimal
    liabilities: Decimal
    net_worth: Decimal
    breakdown: dict[str, Decimal]  # bucket -> asset USD (keys in BUCKETS order)


@dataclass
class Adjustment:
    """Cumulative plug in an ``Equity:Adjustments:*`` account — the untracked flow smoke alarm."""

    account: str
    label: str
    value: Decimal


class NetWorth:
    """Query namespace for net worth. Constructed as ``ledger.net_worth``."""

    def __init__(self, ledger: "Ledger"):
        self._led = ledger

    def totals(self, as_of: dt.date | None = None) -> NetWorthSnapshot:
        """Assets, liabilities (positive = owed), net worth, and the asset split across allocation
        buckets, as of ``as_of`` (today if None)."""
        breakdown = {b: Decimal(0) for b in BUCKETS}
        for a in self._led.declared_accounts(ASSETS):
            breakdown[bucket(a)] += self._led.value(a, as_of)

        assets = sum(breakdown.values(), Decimal(0))
        liab_signed = sum(
            (self._led.balance(a, as_of) for a in self._led.declared_accounts(LIABILITIES)),
            Decimal(0),
        )
        month = (as_of or dt.date.today()).strftime("%Y-%m")
        return NetWorthSnapshot(
            month,
            round_cents(assets),
            round_cents(-liab_signed),
            round_cents(assets + liab_signed),
            {b: round_cents(v) for b, v in breakdown.items()},
        )

    def accounts(self, as_of: dt.date | None = None) -> list[AccountValue]:
        """Every currently-active balance-sheet account with its USD value (for the breakdown)."""
        out: list[AccountValue] = []

        for a in self._led.active_accounts(CASH):
            out.append(AccountValue(a, leaf(a), "cash", bucket(a), self._led.value(a, as_of)))
        for a in self._led.active_accounts(INVESTMENTS):
            label = a[len(INVESTMENTS) :]
            out.append(AccountValue(a, label, "investment", bucket(a), self._led.value(a, as_of)))
        for a in self._led.active_accounts(LIABILITIES):
            bal = self._led.balance(a, as_of)
            out.append(AccountValue(a, leaf(a), "liability", "liability", bal))

        return out

    def _snapshot_months(self) -> dict[str, dt.date]:
        """Latest ``balance``-assertion date per month — the trusted net-worth snapshot points."""
        months: dict[str, dt.date] = {}
        for e in self._led.entries:
            if isinstance(e, data.Balance):
                key = e.date.strftime("%Y-%m")
                if key not in months or e.date > months[key]:
                    months[key] = e.date
        return months

    def series(self) -> list[NetWorthSnapshot]:
        """Monthly net-worth trend over every snapshot month, oldest first."""
        months = self._snapshot_months()
        return [self.totals(months[key]) for key in sorted(months)]

    def adjustments(self, as_of: dt.date | None = None) -> list[Adjustment]:
        """Cumulative balance of each ``Equity:Adjustments:*`` plug (untracked-flow smoke alarm)."""
        return [
            Adjustment(a, a[len(ADJUSTMENTS) :], self._led.balance(a, as_of))
            for a in self._led.declared_accounts(ADJUSTMENTS)
        ]

    def loggable_accounts(self) -> list[str]:
        """Active cash + investment accounts that have an ``Equity:Adjustments:*`` plug to pad
        into (excludes swept passthroughs like Venmo)."""
        declared = set(self._led.declared_accounts(ADJUSTMENTS))
        candidates = self._led.active_accounts(CASH) + self._led.active_accounts(INVESTMENTS)
        return [a for a in candidates if _adjustment_or_none(a) in declared]


def _adjustment_or_none(account: str) -> str | None:
    try:
        return adjustment_account(account)
    except ValueError:
        return None
