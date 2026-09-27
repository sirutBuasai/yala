"""Closing dispatches on kind, since the money's fate differs: none, drained, split, refused while
owed, or cascaded to an employer's deductions."""

from __future__ import annotations

import datetime as dt
from collections.abc import Callable
from decimal import Decimal
from typing import NamedTuple

from fastapi import APIRouter
from pydantic import BaseModel, Field

from yala.ledger import Ledger
from yala.ledger.accounts import (
    Kind,
    employer_links,
    kind_of,
    plug_account,
)
from yala.ledger.constants import CLOSED_WITH_META, EMPLOYER_META
from yala.ledger.paths import leaf
from yala.ledger.plans import reopen_plan
from yala.ledger.rewrite import ledger_files
from yala.ledger.sweep import retire_passthrough
from yala.money import round_cents
from yala.routes.accounts.shared import (
    open_destination,
    reject_referrers,
    require_applies,
    require_closed,
    require_open,
    resolve,
)
from yala.routes.common import (
    MAX_LEGS,
    Amount,
    dec,
    ledger,
    ok,
    parse_date,
    reconcile_sweeps,
    sink,
)
from yala.routes.errors import api_errors, invalid
from yala.sink import FileLedgerSink

router = APIRouter()


class DrainLeg(BaseModel):
    destination: str
    amount: Amount


class AccountCloseIn(BaseModel):
    """The kind decides which optional fields apply."""

    account: str
    destination: str | None = None
    legs: list[DrainLeg] = Field(default=[], max_length=MAX_LEGS)
    date: str | None = None
    # Which of an employer's linked accounts close with it. Sent explicitly, empty list included:
    # the ones left out are unlinked, and that is too consequential to infer from an omitted field.
    close_with: list[str] | None = None


class _Closed(NamedTuple):
    """What a close did: its message, what left the account, what closed with it, and what it left
    open but unlinked."""

    message: str
    moved: Decimal
    also: tuple[str, ...] = ()
    unlinked: tuple[str, ...] = ()


def _reject_unusable(body: AccountCloseIn, kind: Kind) -> None:
    """A bank account takes ``destination`` or ``legs``, not both, since one would silently win."""
    for field, usable in (("destination", kind.drains), ("legs", kind.splits)):
        if getattr(body, field):
            require_applies(kind, field, usable)

    if body.destination and body.legs:
        raise invalid("either one destination or split destinations are allowed")


def _close_with_plug(
    s: FileLedgerSink, led: Ledger, account: str, date: dt.date, meta: dict[str, str] | None = None
) -> None:
    """The plug carries the same ``meta``, or a reopen leaves snapshots nowhere to pad."""
    s.close_account(account, date, meta=meta)
    plug = plug_account(account)
    if plug is not None and led.is_open(plug):
        s.close_account(plug, date, meta=meta)


def _close_plain(body: AccountCloseIn, account: str) -> _Closed:
    """Close an account that holds no money of its own: a category, a deduction."""
    sink().close_account(account, parse_date(body.date))
    return _Closed(f"closed {account}", Decimal(0))


def _reject_holdings(led: Ledger, account: str, date: dt.date) -> None:
    """A bare ``close`` isn't a write-off: the value would drop off the balance sheet
    unexplained."""
    kind = kind_of(account)
    if kind is None or not (kind.drains or kind.splits):
        return

    held = led.value(account, date) if kind.splits else led.balance(account, date)
    if held:
        raise invalid(
            f"{leaf(account)} still holds {held}: retire it on its own row first, which asks "
            "where the money goes"
        )


def _close_employer(body: AccountCloseIn, account: str) -> _Closed:
    """Closes only the accounts the request names and unlinks the rest. Each follower records its
    trigger, so reopening undoes exactly those."""
    date = parse_date(body.date)
    led = ledger()
    linked = employer_links(led, account)

    if linked and body.close_with is None:
        raise invalid(
            f"say which of these close with {leaf(account)}, or send an empty list to unlink "
            f"them all: {', '.join(linked)}"
        )

    chosen = [resolve(a)[0] for a in (body.close_with or [])]
    stranger = [a for a in chosen if a not in linked]
    if stranger:
        raise invalid(f"{', '.join(stranger)} is not linked to {leaf(account)}")

    for a in chosen:
        _reject_holdings(led, a, date)
        reject_referrers(led, a)

    unlink = [a for a in linked if a not in chosen]

    s = sink()
    s.close_account(account, date)
    for a in chosen:
        _close_with_plug(s, led, a, date, meta={CLOSED_WITH_META: account})

    if unlink:
        s.set_metas({a: {EMPLOYER_META: None} for a in unlink})

    return _Closed(f"closed {account}", Decimal(0), tuple(chosen), tuple(unlink))


def _split_legs(
    led: Ledger, account: str, body: AccountCloseIn, value: Decimal
) -> list[tuple[str, Decimal]]:
    """Shared by both splittable kinds, which differ only in how the value is arrived at."""
    for leg in body.legs:
        open_destination(led, leg.destination, account)

    total = round_cents(sum((dec(leg.amount) for leg in body.legs), Decimal(0)))
    if total != value:
        raise invalid(f"legs must sum to the account's USD value {value}; got {total}")

    return [(leg.destination, dec(leg.amount)) for leg in body.legs]


def _liquidate(
    led: Ledger,
    s: FileLedgerSink,
    account: str,
    date: dt.date,
    legs: list[tuple[str, Decimal]],
) -> None:
    """The plug absorbs the sub-cent rounding gap."""
    plug = plug_account(account)
    s.liquidate_into(account, date, legs, plug if plug and led.is_open(plug) else None)


def _close_bank(body: AccountCloseIn, account: str) -> _Closed:
    """The passthrough is retired before the balance is read: its sweep is dated month-end, and
    would land on a closed account."""
    s = sink()
    date = parse_date(body.date)

    retire_passthrough(s, account, date)
    led = ledger()
    balance = led.balance(account, date)

    if body.legs:
        legs = _split_legs(led, account, body, balance)
        _liquidate(led, s, account, date, legs)
        reconcile_sweeps(date)
        return _Closed(f"drained and closed {account}", balance)

    if not body.destination:
        # A bare close is not a write-off: see `_reject_holdings`.
        if balance != 0:
            raise invalid(
                f"{account} still holds {balance}; give a destination to move it to before closing"
            )

        _close_with_plug(s, led, account, date)
        reconcile_sweeps(date)
        return _Closed(f"closed {account}", Decimal(0))

    destination = open_destination(led, body.destination, account)

    if balance != 0:
        # A positive asset balance moves out; a negative one is paid in.
        source, target = (account, destination) if balance > 0 else (destination, account)
        s.append_transfer(
            date=date,
            from_account=source,
            to_account=target,
            amount=abs(balance),
            payee=f"close {leaf(account)}",
        )

    _close_with_plug(s, led, account, date)
    reconcile_sweeps(date)
    return _Closed(f"drained and closed {account}", balance)


def _close_liability(body: AccountCloseIn, account: str) -> _Closed:
    """Refused while anything is owed: writing the payment here would invent its date and funding
    account."""
    date = parse_date(body.date)

    owed = ledger().balance(account, date)
    if owed != 0:
        raise invalid(
            f"{account} still owes {abs(owed)}; pay it off with a bill payment before closing"
        )

    sink().close_account(account, date)
    return _Closed(f"closed {account}", Decimal(0))


def _close_investment(body: AccountCloseIn, account: str) -> _Closed:
    """Value an investment account in USD, split it across the legs, then liquidate and close it.
    The legs must sum to that value (both zero for an empty account)."""
    date = parse_date(body.date)

    led = ledger()
    value = led.value(account, date)
    legs = _split_legs(led, account, body, value)

    _liquidate(led, sink(), account, date, legs)
    reconcile_sweeps(date)
    return _Closed(f"retired {account}", value)


_CLOSERS: dict[str, Callable[[AccountCloseIn, str], _Closed]] = {
    "category": _close_plain,
    "deduction": _close_plain,
    "employer": _close_employer,
    "bank": _close_bank,
    "card": _close_liability,
    "investment": _close_investment,
}


@router.post("/api/account/close")
def post_account_close(body: AccountCloseIn) -> dict:
    """``moved`` is what left it: zero, the drained balance, or the USD value. ``also`` names what
    it carried or left for attention."""
    account, kind = resolve(body.account)
    _reject_unusable(body, kind)
    led = ledger()
    require_open(led, account)
    reject_referrers(led, account)

    with api_errors():
        result = _CLOSERS[kind.name](body, account)

    return ok(
        result.message,
        account=account,
        moved=float(result.moved),
        also=list(result.also),
        unlinked=list(result.unlinked),
    )


# --- reopen ---


class AccountReopenIn(BaseModel):
    account: str


@router.post("/api/account/reopen")
def post_account_reopen(body: AccountReopenIn) -> dict:
    """Deletes the ``close``, since beancount rejects a second ``open``. An employer brings back
    only what its close took; unlinked accounts stay unlinked."""
    account, _ = resolve(body.account)
    led = ledger()

    require_closed(led, account)

    with api_errors():
        files = ledger_files(sink().ledger_dir)
        changes, reopened = reopen_plan(led, files, account)
        sink().rewrite_files(changes)

    return ok(f"reopened {account}", account=account, reopened=reopened)
