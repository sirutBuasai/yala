"""Net-worth domain: assets − liabilities over time, derived from ``balance`` snapshots.

Net worth is never stored — it is recomputed at each logged assertion. Snapshots are written as
``pad`` + ``balance`` pairs (see :meth:`FileLedgerSink.log_balance`), so each account's untracked
delta lands in its own ``Equity:Adjustments:*`` plug, which this domain surfaces as a per-account
sanity check on flows never entered as transactions.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, replace
from decimal import Decimal
from typing import TYPE_CHECKING

from beancount.core import data

from yala.ledger.accounts import sweep_destination, tier_of
from yala.ledger.constants import (
    ADJUSTMENTS,
    ASSETS,
    CASH,
    DEFAULT_CURRENCY,
    INVESTMENTS,
    LIABILITIES,
)
from yala.ledger.locators import locator_of
from yala.ledger.naming import account_name
from yala.money import round_cents

if TYPE_CHECKING:
    from yala.ledger.core import Ledger


# Allocation buckets, in display order: how an asset account contributes to the asset split.
BUCKETS = ("Liquid", "Taxable", "Tax-advantaged")

#: Investment tax tier -> its allocation bucket. Anything not invested is liquid.
_TIER_BUCKETS = {"Taxable": "Taxable", "TaxAdvantaged": "Tax-advantaged"}


def bucket(account: str) -> str:
    """The allocation bucket an asset account falls into (``BUCKETS``)."""
    return _TIER_BUCKETS.get(tier_of(account) or "", "Liquid")


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
    """One logged date's figures; ``liabilities`` is positive drag."""

    date: str  # "YYYY-MM-DD"
    assets: Decimal
    liabilities: Decimal
    net_worth: Decimal
    breakdown: dict[str, Decimal]  # bucket -> asset USD (keys in BUCKETS order)


@dataclass
class Adjustment:
    """Cumulative plug in an ``Equity:Adjustments:*`` account."""

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
        """Every currently-active balance-sheet account with its USD value.

        Labels come from :func:`yala.ledger.naming.account_name`, the same resolver the account
        directory uses, so a name cannot read one way here and another way elsewhere.
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
        """Every distinct ``balance``-assertion date — the trusted snapshot points.

        One point per logged *day*, not per month: a month may carry several snapshots, and
        collapsing them would silently drop the earlier ones."""
        return sorted({e.date for e in self._led.entries if isinstance(e, data.Balance)})

    def series(self) -> list[NetWorthSnapshot]:
        """Net-worth trend over every logged snapshot date, oldest first.

        Each point is valued at the end of the preceding day, because beancount checks a ``balance``
        before that day's postings; reading it at end-of-date would fold in transactions posted on
        the snapshot day and drift the trend away from the asserted figures."""
        return [
            replace(self.totals(d - dt.timedelta(days=1)), date=d.isoformat())
            for d in self._snapshot_dates()
        ]

    def logged_at(self, date: dt.date) -> dict[str, str]:
        """Locator of each account's editable ``balance`` assertion dated ``date``.

        Listed only when the day holds exactly one USD assertion for the account — the shape
        :meth:`FileLedgerSink.update_balance` can rewrite. A share-based snapshot is omitted, since
        changing one leg of it is not a balance edit."""
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
        """Cumulative balance of each ``Equity:Adjustments:*`` plug."""
        return [
            Adjustment(a, a[len(ADJUSTMENTS) :], self._led.balance(a, as_of))
            for a in self._led.declared_accounts(ADJUSTMENTS)
        ]

    def loggable_accounts(self) -> list[str]:
        """Active cash + investment accounts whose balance can be snapshotted.

        Every one of them is opened with a plug to pad into, so the rule is stated rather than
        inferred from a plug's presence: what is excluded is a passthrough, whose balance is swept
        to its destination and so belongs there.
        """
        meta = self._led.account_meta()
        candidates = self._led.active_accounts(CASH) + self._led.active_accounts(INVESTMENTS)
        return [a for a in candidates if sweep_destination(meta.get(a)) is None]

    def loggable_liabilities(self) -> list[str]:
        """Active liability accounts, which are snapshot-able but *verify-only*.

        They carry no ``Equity:Adjustments:*`` plug on purpose: a liability balance is fully
        determined by the entries already made, so a figure that disagrees means one is missing
        rather than that money moved untracked, and :meth:`FileLedgerSink.verify_balance` refuses
        to pad it."""
        return self._led.active_accounts(LIABILITIES)
