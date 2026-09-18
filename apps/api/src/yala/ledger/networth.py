"""Net-worth domain: assets − liabilities over time, derived from ``balance`` snapshots.

Net worth is never stored — it is recomputed at each logged assertion. Snapshots are written as
``pad`` + ``balance`` pairs (see :meth:`FileLedgerSink.log_balance`), so each account's untracked
delta lands in its own ``Equity:Adjustments:*`` plug, which this domain surfaces as a per-account
sanity check on flows never entered as transactions.
"""

from __future__ import annotations

import datetime as dt
from collections.abc import Callable
from dataclasses import dataclass, replace
from decimal import Decimal
from typing import TYPE_CHECKING

from beancount.core import data

from yala.dates import month_bounds, month_of
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


#: The asset subtrees a balance can be snapshotted in, stated once so every reader of them agrees
#: on which accounts a balance pane may offer.
SNAPSHOT_ASSETS = (CASH, INVESTMENTS)

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


@dataclass(frozen=True)
class LoggedBalance:
    """What a month already holds for one account, and whether it can be corrected.

    ``amount`` is as stored, so a liability's is negative."""

    #: The snapshot the figure came from — not necessarily the month's first day.
    date: dt.date
    #: USD at ``date``; share lots valued at that date's prices.
    amount: Decimal
    #: Handle to rewrite ``date``'s assertion, or None when it is share-based and so not rewritable.
    locator: str | None


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

    def snapshot_dates(self) -> list[dt.date]:
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
            for d in self.snapshot_dates()
        ]

    def logged_in_month(self, any_day: dt.date) -> dict[str, LoggedBalance]:
        """What each account's snapshot stands at within ``any_day``'s month.

        A month may carry several snapshot dates covering different accounts, so the latest date
        carrying *that account* wins rather than the latest date in the month. Share legs are summed
        at their own date's prices, the figure the account was snapshotted to.

        Only that latest snapshot is offered for correction, and only when it is a lone USD
        assertion: reaching back to an earlier one would rewrite a date the displayed figure did not
        come from, silently restating it and plugging the difference, and rewriting one leg of a
        share-based snapshot is not a balance edit."""
        in_month: dict[str, list[data.Balance]] = {}
        for e in self._led.entries:
            if isinstance(e, data.Balance) and month_of(e.date) == month_of(any_day):
                in_month.setdefault(e.account, []).append(e)

        out: dict[str, LoggedBalance] = {}
        for account, entries in in_month.items():
            latest = max(e.date for e in entries)
            at_latest = [e for e in entries if e.date == latest]

            held: dict[str, Decimal] = {}
            for e in at_latest:
                held[e.amount.currency] = held.get(e.amount.currency, Decimal(0)) + (
                    e.amount.number or Decimal(0)
                )

            rewritable = len(at_latest) == 1 and at_latest[0].amount.currency == DEFAULT_CURRENCY
            out[account] = LoggedBalance(
                date=latest,
                amount=self._led.value_of(held, latest),
                locator=locator_of(at_latest[0].meta) if rewritable else None,
            )

        return out

    def adjustments(self, as_of: dt.date | None = None) -> list[Adjustment]:
        """Cumulative balance of each ``Equity:Adjustments:*`` plug."""
        return [
            Adjustment(a, a[len(ADJUSTMENTS) :], self._led.balance(a, as_of))
            for a in self._led.declared_accounts(ADJUSTMENTS)
        ]

    def _snapshotable(self, pick: Callable[[str], list[str]]) -> list[str]:
        """The snapshot-able accounts ``pick`` finds under each asset subtree, passthroughs removed.

        Every loggable account is opened with a plug to pad into, so the rule is stated rather than
        inferred from a plug's presence: what is excluded is a passthrough, whose balance is swept
        to its destination and so belongs there.
        """
        meta = self._led.account_meta()
        found = [a for prefix in SNAPSHOT_ASSETS for a in pick(prefix)]

        return [a for a in found if sweep_destination(meta.get(a)) is None]

    def loggable_accounts(self) -> list[str]:
        """Active cash + investment accounts whose balance can be snapshotted."""
        return self._snapshotable(self._led.active_accounts)

    def loggable_in_month(self, any_day: dt.date) -> tuple[list[str], list[str]]:
        """``(assets, liabilities)`` snapshot-able in ``any_day``'s month.

        Membership is the month's, not today's: an account opened part-way through it belongs to
        it, one closed part-way through does not belong to the month after, and one opened later
        does not appear at all."""
        start, end = month_bounds(any_day)

        def during(prefix: str) -> list[str]:
            return self._led.accounts_open_during(start, end, prefix)

        return self._snapshotable(during), during(LIABILITIES)

    def loggable_liabilities(self) -> list[str]:
        """Active liability accounts, which are snapshot-able.

        A liability balance is fully determined by the entries already made, so a figure that
        disagrees means one is missing rather than that money moved untracked. Until statement-cycle
        tracking can say which entry, the difference pads to the card's own plug, which is created
        on first use (see :func:`yala.ledger.accounts.snapshot_plug`)."""
        return self._led.active_accounts(LIABILITIES)
