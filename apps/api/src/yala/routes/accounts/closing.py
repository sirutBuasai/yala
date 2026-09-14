"""Whether an account is in play: closing it, and reopening it.

Closing dispatches on the account's kind, since what has to happen to the money differs: a category
holds none, a bank account drains to one destination, an investment splits across several, a card is
refused until nothing is owed, and an employer takes its own deductions with it.
"""

from __future__ import annotations

import datetime as dt
from collections.abc import Callable
from decimal import Decimal
from typing import NamedTuple

from fastapi import APIRouter, HTTPException
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
from yala.routes.accounts.shared import open_destination, reject_referrers, require_open, resolve
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
from yala.routes.errors import api_errors
from yala.sink import FileLedgerSink

router = APIRouter()


class DrainLeg(BaseModel):
    destination: str
    amount: Amount


class AccountCloseIn(BaseModel):
    """Close an account of any kind. Which of the optional fields apply is decided by the account's
    kind, not by the caller: a category takes none, a bank account a single ``destination``, an
    investment a list of ``legs``."""

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
    """Report a close field the kind has no use for, or two that contradict each other.

    Which of them apply is the kind's own business, not the caller's: only a bank account carries a
    standing balance one ``destination`` can absorb, and only an investment has a value to split
    across ``legs``. A bank account can take either, but not both — one would silently win.
    """
    for field, usable in (("destination", kind.drains), ("legs", kind.splits)):
        if getattr(body, field) and not usable:
            raise HTTPException(
                status_code=422, detail=f"{field} does not apply to a {kind.name} account"
            )

    if body.destination and body.legs:
        raise HTTPException(
            status_code=422,
            detail="either one destination or split destinations are allowed",
        )


def _close_with_plug(
    s: FileLedgerSink, led: Ledger, account: str, date: dt.date, meta: dict[str, str] | None = None
) -> None:
    """Close ``account`` and the plug paired with it, so reopening can bring both back.

    The plug carries the same ``meta``: without it a reopen would bring the account back with
    nowhere for its snapshots to pad.
    """
    s.close_account(account, date, meta=meta)
    plug = plug_account(account)
    if plug is not None and led.is_open(plug):
        s.close_account(plug, date, meta=meta)


def _close_plain(body: AccountCloseIn, account: str) -> _Closed:
    """Close an account that holds no money of its own: a category, a deduction."""
    sink().close_account(account, parse_date(body.date))
    return _Closed(f"closed {account}", Decimal(0))


def _reject_holdings(led: Ledger, account: str, date: dt.date) -> None:
    """Refuse to close an account that still holds value as a side effect of closing an employer.

    A bare ``close`` is not a write-off: beancount accepts it whatever the account holds, and the
    value then drops off the balance sheet with no entry saying where it went. Retiring it names
    where the money goes, so that is where it has to happen.
    """
    kind = kind_of(account)
    if kind is None or not (kind.drains or kind.splits):
        return

    held = led.value(account, date) if kind.splits else led.balance(account, date)
    if held:
        raise HTTPException(
            status_code=422,
            detail=(
                f"{leaf(account)} still holds {held}: retire it on its own row first, which asks "
                "where the money goes"
            ),
        )


def _close_employer(body: AccountCloseIn, account: str) -> _Closed:
    """Close an employer, closing the accounts the request names with it and unlinking the rest.

    Nothing follows an employer out on its own: which of its deductions and plans close with it is
    the caller's decision. One left open is *unlinked* — a job that has ended cannot go on scoping
    payroll line items — but it keeps its name, since a name is not a link. Each close that does
    follow records what triggered it, so reopening the employer undoes exactly those and leaves an
    account closed on its own account alone.
    """
    date = parse_date(body.date)
    led = ledger()
    linked = employer_links(led, account)

    if linked and body.close_with is None:
        raise HTTPException(
            status_code=422,
            detail=(
                f"say which of these close with {leaf(account)}, or send an empty list to unlink "
                f"them all: {', '.join(linked)}"
            ),
        )

    chosen = [resolve(a)[0] for a in (body.close_with or [])]
    stranger = [a for a in chosen if a not in linked]
    if stranger:
        raise HTTPException(
            status_code=422, detail=f"{', '.join(stranger)} is not linked to {leaf(account)}"
        )

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
    """The legs a close splits ``value`` across, checked against it.

    Shared by the two kinds that can be split: they differ in how the value is arrived at — a bank
    holds it in USD already, an investment has to be valued at the day's prices — not in how it is
    divided up.
    """
    for leg in body.legs:
        open_destination(led, leg.destination, account)

    total = round_cents(sum((dec(leg.amount) for leg in body.legs), Decimal(0)))
    if total != value:
        raise HTTPException(
            status_code=422,
            detail=f"legs must sum to the account's USD value {value}; got {total}",
        )

    return [(leg.destination, dec(leg.amount)) for leg in body.legs]


def _liquidate(
    led: Ledger,
    s: FileLedgerSink,
    account: str,
    date: dt.date,
    legs: list[tuple[str, Decimal]],
) -> None:
    """Convert the account to USD, split it across ``legs``, and close it with its plug.

    The plug is passed only while it is open, since it is what absorbs the sub-cent rounding gap.
    """
    plug = plug_account(account)
    s.liquidate_into(account, date, legs, plug if plug and led.is_open(plug) else None)


def _close_bank(body: AccountCloseIn, account: str) -> _Closed:
    """Close a bank account, moving any balance out first: to one ``destination``, or split across
    ``legs``.

    The passthrough is retired before the balance is read, whichever way the close goes: its sweep
    is dated month-end, so an earlier close would leave a transfer against a closed account.
    """
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
        # A bare close is not a write-off: beancount accepts `close` whatever the account holds, and
        # the account then drops off the balance sheet carrying its value with it, with no entry
        # saying where it went.
        if balance != 0:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"{account} still holds {balance}; give a destination to move it to before "
                    "closing"
                ),
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
    """Close a card, which is refused while anything is still owed on it.

    A liability is discharged by paying it, and that payment is a real bill-pay entry with a date
    and a funding account. Writing one as a side effect of closing would invent both.
    """
    date = parse_date(body.date)

    owed = ledger().balance(account, date)
    if owed != 0:
        raise HTTPException(
            status_code=422,
            detail=(
                f"{account} still owes {abs(owed)}; pay it off with a bill payment before closing"
            ),
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
    """Close an account, dispatching on its kind. ``moved`` is what left it: zero for a plain close,
    the drained balance for a bank account, the USD value for an investment. ``also`` names what the
    close carried with it or left behind for attention."""
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
    """Undo a close — a mis-click, or a rehire.

    The only operation the ledger cannot express as a further entry: beancount rejects a second
    ``open``, so the ``close`` directive is deleted instead. An employer brings back exactly the
    accounts its own close closed with it. One that was unlinked instead stayed open and stays
    unlinked: whether a past job's plan belongs to the next one is not something a reopen can know.
    """
    account, _ = resolve(body.account)
    led = ledger()

    if account not in led.declared_accounts():
        raise HTTPException(status_code=404, detail=f"unknown account: {account!r}")
    if led.is_open(account):
        raise HTTPException(status_code=422, detail=f"{account} is already open")

    with api_errors():
        files = ledger_files(sink().ledger_dir)
        changes, reopened = reopen_plan(led, files, account)
        sink().rewrite_files(changes)

    return ok(f"reopened {account}", account=account, reopened=reopened)
