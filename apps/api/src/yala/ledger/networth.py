"""Net-worth domain: assets − liabilities over time, derived from ``balance`` snapshots.

Net worth is never stored: it's ``Assets`` (cash + investments valued at price) minus
``Liabilities`` (credit cards, taxes owed), read at each month's ``balance`` assertion. Snapshots
are logged as ``pad`` + ``balance`` pairs (see :meth:`FileLedgerSink.log_balance`); the ``pad``
routes each account's untracked delta to its own ``Equity:Adjustments:*`` plug, which this domain
surfaces as a per-account sanity check on flows that were never entered as transactions.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, replace
from decimal import Decimal
from typing import TYPE_CHECKING

from beancount.core import data

from yala.ledger.constants import (
    ADJUSTMENTS,
    ASSETS,
    CASH,
    DEFAULT_CURRENCY,
    INVEST_TAX_ADVANTAGED,
    INVEST_TAXABLE,
    INVESTMENTS,
    LIABILITIES,
)
from yala.ledger.locators import locator_of
from yala.ledger.naming import account_name
from yala.money import round_cents

if TYPE_CHECKING:
    from yala.ledger.core import Ledger


def adjustment_account(account: str) -> str:
    """The ``Equity:Adjustments:*`` plug account paired with snapshots of ``account``.

    Cash keeps its leaf (``Assets:Cash:BankA`` → ``Equity:Adjustments:BankA``); investments drop the
    tax tier so both trees share one plug (``Assets:Investments:Taxable:BrokerA`` →
    ``Equity:Adjustments:Investments:BrokerA``). Raises for anything else."""
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
    """A net-worth snapshot at one logged date: assets, liabilities (positive drag), net, and the
    asset split across allocation buckets."""

    date: str  # "YYYY-MM-DD"
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
        return NetWorthSnapshot(
            (as_of or dt.date.today()).isoformat(),
            round_cents(assets),
            round_cents(-liab_signed),
            round_cents(assets + liab_signed),
            {b: round_cents(v) for b, v in breakdown.items()},
        )

    def accounts(self, as_of: dt.date | None = None) -> list[AccountValue]:
        """Every currently-active balance-sheet account with its USD value (for the breakdown).

        Labels come from :func:`yala.ledger.naming.account_name`, the same resolver the account
        directory uses, so a name can't read one way here and another way elsewhere. Investments
        previously carried their tax tier in the label (``Taxable:BrokerStocks``); they now read
        like every other account, since the tier is already on the row as its ``bucket``.
        """
        meta = self._led.account_meta()
        out: list[AccountValue] = []

        for a in self._led.active_accounts(CASH):
            label = account_name(a, meta.get(a))
            out.append(AccountValue(a, label, "cash", bucket(a), self._led.value(a, as_of)))
        for a in self._led.active_accounts(INVESTMENTS):
            label = account_name(a, meta.get(a))
            out.append(AccountValue(a, label, "investment", bucket(a), self._led.value(a, as_of)))
        for a in self._led.active_accounts(LIABILITIES):
            bal = self._led.balance(a, as_of)
            out.append(AccountValue(a, account_name(a, meta.get(a)), "liability", "liability", bal))

        return out

    def _snapshot_dates(self) -> list[dt.date]:
        """Every distinct ``balance``-assertion date — the trusted net-worth snapshot points.

        One point per logged *day*, not per month: a month may carry several snapshots (e.g. a
        month-start balance plus a mid-month reclassification), and collapsing them would silently
        drop the earlier ones."""
        return sorted({e.date for e in self._led.entries if isinstance(e, data.Balance)})

    def series(self) -> list[NetWorthSnapshot]:
        """Net-worth trend over every logged snapshot date, oldest first.

        Each point is the balance *as asserted* on its date. beancount evaluates a ``balance``
        directive before that day's postings, so the snapshot value is the total at the end of the
        preceding day — reading it at end-of-date would fold in transactions posted on the snapshot
        day itself and drift the trend away from the logged figures."""
        return [
            replace(self.totals(d - dt.timedelta(days=1)), date=d.isoformat())
            for d in self._snapshot_dates()
        ]

    def logged_at(self, date: dt.date) -> dict[str, str]:
        """Locator of each account's editable ``balance`` assertion dated ``date``.

        An account is only listed when that day holds exactly one assertion for it and that
        assertion is in USD — the shape :meth:`FileLedgerSink.update_balance` can rewrite. A
        share-based snapshot (several commodity assertions plus a USD residual) is deliberately
        omitted, since changing one leg of it is not a balance edit."""
        by_account: dict[str, list[data.Balance]] = {}
        for e in self._led.entries:
            if isinstance(e, data.Balance) and e.date == date:
                by_account.setdefault(e.account, []).append(e)

        return {
            account: locator_of(entries[0].meta)
            for account, entries in by_account.items()
            if len(entries) == 1 and entries[0].amount.currency == DEFAULT_CURRENCY
        }

    def adjustments(self, as_of: dt.date | None = None) -> list[Adjustment]:
        """Cumulative balance of each ``Equity:Adjustments:*`` plug (untracked-flow smoke alarm)."""
        return [
            Adjustment(a, a[len(ADJUSTMENTS) :], self._led.balance(a, as_of))
            for a in self._led.declared_accounts(ADJUSTMENTS)
        ]

    def loggable_accounts(self) -> list[str]:
        """Active cash + investment accounts that have an ``Equity:Adjustments:*`` plug to pad
        into (excludes swept passthroughs, whose balance belongs to their destination)."""
        declared = set(self._led.declared_accounts(ADJUSTMENTS))
        candidates = self._led.active_accounts(CASH) + self._led.active_accounts(INVESTMENTS)
        return [a for a in candidates if _adjustment_or_none(a) in declared]

    def loggable_liabilities(self) -> list[str]:
        """Active liability accounts, which are snapshot-able but *verify-only*.

        They carry no ``Equity:Adjustments:*`` plug on purpose: a card balance is fully determined
        by the spending and bill payments already entered, so a figure that disagrees means an
        entry is missing rather than that money moved untracked. Padding the gap would bury that,
        so :meth:`FileLedgerSink.verify_balance` refuses it instead."""
        return self._led.active_accounts(LIABILITIES)


def _adjustment_or_none(account: str) -> str | None:
    try:
        return adjustment_account(account)
    except ValueError:
        return None
