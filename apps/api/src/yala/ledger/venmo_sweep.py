"""Auto-maintained Venmo sweep.

Venmo is a passthrough for Wealthfront: every dollar that flows in or out of Venmo is really pulled
from or pushed to Wealthfront. Rather than hand-entering a monthly transfer, the backend keeps
Venmo balanced to zero by maintaining one sweep transfer per month between Venmo and Wealthfront:

* net Venmo outflow (spending) → ``Wealthfront → Venmo`` for the net amount,
* net Venmo inflow (money received) → ``Venmo → Wealthfront``,
* net zero → no sweep at all.

Reconciled after every write that could touch a month's Venmo activity, so it appears on the first
Venmo transaction, accumulates into that single entry as more are added, and vanishes if activity
nets back to zero. The sweep's own legs are excluded from the net, so reconciling is idempotent.
"""

from __future__ import annotations

import calendar
import datetime as dt
from decimal import Decimal
from typing import TYPE_CHECKING

from yala.ledger import Ledger
from yala.ledger.constants import SWEEP_PAYEE, VENMO, VENMO_PASSTHROUGH
from yala.money import round_cents

if TYPE_CHECKING:
    from yala.ledger.transfers import Transfer
    from yala.sink import FileLedgerSink

Month = tuple[int, int]  # (year, month)

_SWEEP_ACCOUNTS = {VENMO, VENMO_PASSTHROUGH}


# --- sweep identity ---


def _sweeps_in(ledger: Ledger, year: int, month: int) -> list["Transfer"]:
    return [
        t
        for t in ledger.transfers.transactions(year, month)
        if {t.from_account, t.to_account} == _SWEEP_ACCOUNTS
    ]


def is_sweep(accounts: list[str]) -> bool:
    """Whether a transfer's accounts are exactly Venmo ↔ Wealthfront — i.e. it occupies the
    auto-managed sweep slot, whatever its payee or direction."""
    return len(accounts) == 2 and set(accounts) == _SWEEP_ACCOUNTS


# --- reconciliation ---


def _last_day(year: int, month: int) -> dt.date:
    return dt.date(year, month, calendar.monthrange(year, month)[1])


def _net_activity(ledger: Ledger, year: int, month: int, sweeps: list["Transfer"]) -> Decimal:
    """Net of every Venmo posting for the month, minus the sweeps' own Venmo legs. Negative = Venmo
    paid out more than it took in (push money in); positive = it took in more (drain back)."""
    total = Decimal(0)
    for t in ledger.transactions(year, month):
        for p in t.postings:
            if p.account == VENMO:
                total += p.amount
    for s in sweeps:
        total -= s.amount if s.to_account == VENMO else -s.amount
    return round_cents(total)


def _matches(
    sweep: "Transfer", from_account: str, to_account: str, amount: Decimal, date: dt.date
) -> bool:
    """Whether the existing sweep already equals the desired one, so an idempotent reconcile skips
    a redundant write instead of churning the file."""
    return (
        not sweep.pending
        and sweep.payee == SWEEP_PAYEE
        and sweep.date == date
        and sweep.from_account == from_account
        and sweep.to_account == to_account
        and round_cents(sweep.amount) == amount
    )


def reconcile_month(sink: "FileLedgerSink", year: int, month: int) -> None:
    """Bring the single Venmo sweep for ``year``/``month`` in line with the month's net Venmo
    activity: create it, update it in place, or delete it so Venmo nets to zero."""
    ledger = Ledger(sink.main_ledger, strict=True).load()
    sweeps = _sweeps_in(ledger, year, month)

    for extra in sweeps[1:]:  # keep one canonical sweep; drop any duplicates
        sink.delete_entry(extra.locator)
    existing = sweeps[0] if sweeps else None

    net = _net_activity(ledger, year, month, sweeps)

    if net == 0:
        if existing is not None:
            sink.delete_entry(existing.locator)
        return

    # The sweep's Venmo leg cancels the net: a net outflow pulls money in from Wealthfront, a net
    # inflow drains it back.
    from_account, to_account = (VENMO_PASSTHROUGH, VENMO) if net < 0 else (VENMO, VENMO_PASSTHROUGH)
    amount = abs(net)
    date = _last_day(year, month)

    if existing is not None and _matches(existing, from_account, to_account, amount, date):
        return

    if existing is not None:
        sink.update_transfer(
            existing.locator,
            from_account=from_account,
            to_account=to_account,
            amount=amount,
            date=date,
            payee=SWEEP_PAYEE,
        )
    else:
        sink.append_transfer(
            date=date,
            from_account=from_account,
            to_account=to_account,
            amount=amount,
            payee=SWEEP_PAYEE,
        )


def reconcile_months(sink: "FileLedgerSink", months: set[Month]) -> None:
    """Reconcile the sweep for each affected month (each month is independent)."""
    for year, month in months:
        reconcile_month(sink, year, month)
