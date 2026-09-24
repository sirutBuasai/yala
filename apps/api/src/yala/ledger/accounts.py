"""What an account is: the kind its prefix puts it in, what is opened beside it, and what stands in
the way of closing it.

Everything here is a fact read off the ledger. The HTTP layer turns a refusal into a status code;
:mod:`yala.ledger.plans` turns a change into rewritten text.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, fields
from typing import TYPE_CHECKING

from beancount.core import data

from yala.ledger.constants import (
    ADJUSTMENTS,
    CASH,
    CREDIT_CARDS,
    DEDUCTIONS,
    DEFAULT_CURRENCY,
    EMPLOYER_META,
    EXPENSES,
    INVEST_ADJUSTMENTS,
    INVESTMENTS,
    LABELS_META,
    LIABILITIES,
    OPENING_BALANCES,
    SALARY,
    SWEEP_META,
    meta_str,
)
from yala.ledger.naming import compose_stem
from yala.ledger.paths import leaf

if TYPE_CHECKING:
    from yala.ledger.core import Ledger

#: Investment tax tiers. A tier is a path segment, so changing one moves the account rather than
#: editing its metadata.
TIERS: tuple[str, ...] = ("Taxable", "TaxAdvantaged")


@dataclass(frozen=True)
class Kind:
    """One manageable kind of account: where it lives and what it is allowed to carry."""

    name: str
    prefix: str
    #: ``None`` leaves the account unconstrained, so it can hold tickers one month and dollars the
    #: next.
    currency: str | None = DEFAULT_CURRENCY
    #: Sits in a tax tier, which a rename can move it between.
    tiered: bool = False
    #: Opened with an ``Equity:Adjustments:*`` plug and a genesis assertion, which together are what
    #: make its balance loggable.
    plugged: bool = False
    #: Carries the institution and alias metadata that shortens its display name.
    named: bool = False
    #: Its name has a product half beside the institution. There is one cash account per bank, so a
    #: bank account is named by institution alone.
    product: bool = False
    #: May be scoped to one employer.
    scopable: bool = False
    #: Offers payroll contribution labels.
    labelled: bool = False
    #: Closing it may move a standing balance to one destination. The only route that can settle an
    #: overdrawn account, where the money moves the other way.
    drains: bool = False
    #: Closing it may split its value across several destinations instead.
    splits: bool = False
    #: May be a passthrough, holding no money of its own.
    sweeps: bool = False
    #: May receive a sweep — an account money is meant to sit in.
    sweep_target: bool = False
    #: Reconciled against its bank app, whose balance may or may not count pending charges.
    reconciled: bool = False


#: The fields the wire contract ships for each kind. Everything but ``currency``, which is a detail
#: of writing the ``open`` directive and tells a form nothing.
KIND_FIELDS: tuple[str, ...] = tuple(f.name for f in fields(Kind) if f.name != "currency")

#: Every manageable kind, longest prefix first so a deduction is never read as a spending category.
KINDS: tuple[Kind, ...] = (
    Kind("deduction", DEDUCTIONS, scopable=True),
    Kind("employer", SALARY),
    Kind("card", CREDIT_CARDS, named=True, product=True, reconciled=True),
    Kind(
        "investment",
        INVESTMENTS,
        currency=None,
        tiered=True,
        plugged=True,
        named=True,
        product=True,
        scopable=True,
        labelled=True,
        splits=True,
        sweep_target=True,
    ),
    Kind(
        "bank",
        CASH,
        plugged=True,
        named=True,
        drains=True,
        splits=True,
        sweeps=True,
        sweep_target=True,
    ),
    Kind("category", EXPENSES),
)

KINDS_BY_NAME: dict[str, Kind] = {k.name: k for k in KINDS}


def kind_of(account: str) -> Kind | None:
    """The manageable kind ``account`` belongs to, or ``None`` for one this app does not manage
    (a plug, an opening-balance account, a liability that is not a card)."""
    return next((k for k in KINDS if account.startswith(k.prefix)), None)


def tier_of(account: str) -> str | None:
    """The tax tier an investment account sits in, or ``None`` for an account with no tier."""
    if not account.startswith(INVESTMENTS):
        return None
    head = account[len(INVESTMENTS) :].split(":", 1)[0]
    return head if head in TIERS else None


# --- paths ---
#
# An account's path is ``prefix + tier + stem``, and the stem is one segment composed from the
# name's parts. Opening, renaming a part and renaming an institution all build a path through these
# two functions, so they cannot disagree about which part of a path a name owns.


def stem_of(account: str, kind: Kind) -> str:
    """The part of ``account``'s path its name composes to: everything below the prefix and tier."""
    tier = tier_of(account)
    return account[len(kind.prefix) + (len(tier) + 1 if tier else 0) :]


def account_path(kind: Kind, stem: str, tier: str | None = None) -> str:
    """The path an account of ``kind`` named ``stem`` sits at."""
    return kind.prefix + (f"{tier}:" if tier else "") + stem


def named_path(kind: Kind, institution: str | None, product: str | None, tier: str | None) -> str:
    """The path a named account's typed parts compose to."""
    return account_path(kind, compose_stem(institution, product if kind.product else None), tier)


def plug_account(account: str) -> str | None:
    """The ``Equity:Adjustments:*`` plug paired with snapshots of ``account``, or ``None`` for an
    account that gets none (a card, a category, an employer).

    One plug per account, the investment tier included: two accounts differing only by tier are
    different accounts, and a shared plug would make opening the second, retiring either, or
    renaming one ambiguous.
    """
    if account.startswith(CASH):
        return ADJUSTMENTS + account[len(CASH) :]
    if account.startswith(INVESTMENTS):
        return INVEST_ADJUSTMENTS + account[len(INVESTMENTS) :]
    return None


def snapshot_plug(account: str) -> str:
    """Where a snapshot of ``account`` pads the difference it cannot explain.

    A card pads into opening balances, and only up to its baseline (see
    :func:`yala.ledger.cards.must_agree`). Any other liability gets a per-account plug like an
    asset's, created the first time it is snapshotted.
    """
    if account.startswith(CREDIT_CARDS):
        return OPENING_BALANCES
    if account.startswith(LIABILITIES):
        return ADJUSTMENTS + account[len(LIABILITIES) :]

    plug = plug_account(account)
    if plug is None:
        raise ValueError(f"not a snapshot-able account: {account!r}")

    return plug


# --- metadata reads ---


def open_entry(ledger: "Ledger", account: str) -> data.Open | None:
    """The ``open`` directive declaring ``account``, or ``None`` if it has none."""
    return next(
        (e for e in ledger.entries if isinstance(e, data.Open) and e.account == account), None
    )


def employer_scope(meta: Mapping[str, object] | None) -> str | None:
    """The employer an account is scoped to, or ``None`` when it serves every employer.

    Optional by design: a shared deduction outlives any one job, and so does a retirement plan.
    """
    return meta_str(meta, EMPLOYER_META)


def labels_of(meta: Mapping[str, object] | None) -> list[str]:
    """The contribution labels an account offers, from its comma-joined ``labels`` meta."""
    raw = meta_str(meta, LABELS_META) or ""
    return [s.strip() for s in raw.split(",") if s.strip()]


def sweep_destination(meta: Mapping[str, object] | None) -> str | None:
    return meta_str(meta, SWEEP_META)


# --- lifecycle facts ---


def declared_family(ledger: "Ledger", account: str) -> list[str]:
    """``account`` plus every declared account beneath it — what a rename carries along."""
    return [a for a in ledger.declared_accounts() if a == account or a.startswith(f"{account}:")]


def sweep_referrers(ledger: "Ledger", account: str) -> list[str]:
    """Active accounts that sweep into ``account``.

    Closing it would leave each of them sweeping into a closed account, which reconcile can only
    skip; the referrers are named so they can be repointed first.
    """
    meta = ledger.account_meta()
    return sorted(
        a
        for a in ledger.active_accounts()
        if a != account and sweep_destination(meta.get(a)) == account
    )


def scoped_to(ledger: "Ledger", prefix: str, employer: str, *, active: bool = True) -> list[str]:
    """Accounts under ``prefix`` whose ``employer`` meta names ``employer``."""
    meta = ledger.account_meta()
    pool = ledger.active_accounts(prefix) if active else ledger.declared_accounts(prefix)
    return sorted(a for a in pool if employer_scope(meta.get(a)) == employer)


def employer_links(ledger: "Ledger", account: str) -> list[str]:
    """The active accounts scoped to employer ``account`` — its deductions and its plans.

    What closing it has to decide about, not what it closes: nothing follows an employer out on its
    own. A deduction with no ``employer`` meta serves every employer and is not linked to any.
    """
    if kind_of(account) is not KINDS_BY_NAME["employer"]:
        return []

    employer = leaf(account)

    return sorted(
        scoped_to(ledger, DEDUCTIONS, employer) + scoped_to(ledger, INVESTMENTS, employer)
    )
