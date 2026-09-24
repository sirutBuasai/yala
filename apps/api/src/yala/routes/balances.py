"""Net-worth snapshots: logging a balance, correcting one, and reading a past date's figures."""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from yala.ledger.accounts import snapshot_plug
from yala.ledger.constants import CASH, INVESTMENTS, LIABILITIES
from yala.routes.common import (
    SignedAmount,
    dec,
    ledger,
    ok,
    parse_date,
    reconcile_sweeps,
    sink,
    valid_name,
)
from yala.routes.errors import api_errors, invalid

router = APIRouter()


class BalanceIn(BaseModel):
    account: str
    amount: SignedAmount
    date: str | None = None


@router.post("/api/balance")
def post_balance(body: BalanceIn) -> dict:
    """Log a USD balance snapshot as a ``pad`` + ``balance`` pair, routing whatever the entries do
    not explain to the account's plug (see :func:`snapshot_plug`).

    A card past its baseline (see :func:`yala.ledger.cards.baseline`) has nothing to pad into, so a
    figure that disagrees is refused naming the gap: spending or a bill payment has not been
    entered."""
    account = valid_name(body.account)
    if not account.startswith((CASH, INVESTMENTS, LIABILITIES)):
        raise invalid(f"not a balance-loggable account: {account!r}")

    date = parse_date(body.date)

    with api_errors():
        # Signed as a statement reads it: on a liability, owed positive and a credit negative.
        entry_id = sink().log_balance(account, dec(body.amount), date, snapshot_plug(account))
        reconcile_sweeps(date)

    # the locator lets the client edit what it just logged without refetching the whole month
    return ok(
        f"logged balance for {account}",
        account=account,
        date=date.isoformat(),
        locator=f"id:{entry_id}",
    )


class BalanceEditIn(BaseModel):
    locator: str
    amount: SignedAmount


@router.post("/api/balance/update")
def post_balance_update(body: BalanceEditIn) -> dict:
    """Edit an existing ``balance`` assertion in place, keeping one snapshot per logged date.

    Re-logging the same date would stack a second assertion on it, so correcting a past month
    rewrites its own line, located by the handle ``/api/networth`` reports for that date."""
    with api_errors():
        account, date, locator = sink().update_balance(body.locator, dec(body.amount))
        reconcile_sweeps(date)

    # echo the locator: editing a migrated assertion stamps an id, upgrading it from a line handle
    return ok(
        f"updated balance for {account}",
        account=account,
        date=date.isoformat(),
        locator=locator,
    )


@router.get("/api/networth")
def get_networth_at(date: str) -> dict:
    """Per-account USD values and adjustment-plug balances as of ``date``, plus what ``date``'s own
    month already has logged. This is what lets the balance pane show a past month's own figures,
    and offer the handle to correct them in place.

    ``cards`` is what each card's bank app should read at the end of ``date``, as stored."""
    as_of = parse_date(date)
    nw = ledger().net_worth
    month_assets, month_liabilities = nw.loggable_in_month(as_of)
    return {
        # Which accounts the MONTH had, so a pane does not offer one opened later or closed earlier.
        "balance_accounts": month_assets,
        "liability_accounts": month_liabilities,
        "accounts": [{"account": a.account, "value": float(a.value)} for a in nw.accounts(as_of)],
        "adjustments": [
            {"account": a.account, "value": float(a.value)} for a in nw.adjustments(as_of)
        ],
        # account -> what its latest snapshot in this month stands at, with a locator only where
        # that snapshot can be rewritten. Amounts are as stored, so a liability's is negative.
        "logged": {
            account: {"date": b.date.isoformat(), "amount": float(b.amount), "locator": b.locator}
            for account, b in nw.logged_in_month(as_of).items()
        },
        "cards": {
            account: {
                "expected": float(c.expected),
                "must_agree": c.must_agree,
            }
            for account, c in nw.card_checks(as_of).items()
        },
    }
