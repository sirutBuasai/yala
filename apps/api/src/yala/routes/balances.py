"""Net-worth snapshots: logging a balance, correcting one, and reading a past date's figures."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from yala.ledger.accounts import plug_account
from yala.ledger.constants import CASH, INVESTMENTS, LIABILITIES
from yala.routes.common import (
    NonNegAmount,
    dec,
    ledger,
    ok,
    parse_date,
    reconcile_sweeps,
    sink,
    valid_name,
)
from yala.routes.errors import api_errors

router = APIRouter()


class BalanceIn(BaseModel):
    account: str
    amount: NonNegAmount
    date: str | None = None


@router.post("/api/balance")
def post_balance(body: BalanceIn) -> dict:
    """Log a USD balance snapshot.

    A cash or investment account gets a ``pad`` + ``balance`` pair routing the untracked delta to
    its ``Equity:Adjustments:*`` plug. A liability has no plug, so it is verify-only: the figure
    must match what the ledger already computes, otherwise spending or a bill payment is missing and
    the mismatch is reported rather than padded away."""
    account = valid_name(body.account)
    if not account.startswith((CASH, INVESTMENTS, LIABILITIES)):
        raise HTTPException(status_code=422, detail=f"not a balance-loggable account: {account!r}")

    date = parse_date(body.date)

    with api_errors():
        if account.startswith(LIABILITIES):
            # Verify-only: the client sends what is owed; the sink stores it negative.
            entry_id = sink().verify_balance(account, dec(body.amount), date)
        else:
            entry_id = sink().log_balance(account, dec(body.amount), date, plug_account(account))
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
    amount: NonNegAmount


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
    """Per-account USD values, adjustment-plug balances, and editable-assertion locators as of
    ``date``. This is what lets the balance pane show a past month's own figures, and offer the
    handle to correct them in place."""
    as_of = parse_date(date)
    nw = ledger().net_worth
    return {
        "accounts": [{"account": a.account, "value": float(a.value)} for a in nw.accounts(as_of)],
        "adjustments": [
            {"account": a.account, "value": float(a.value)} for a in nw.adjustments(as_of)
        ],
        # account -> locator, present only where that date already holds an editable USD assertion
        "logged": nw.logged_at(as_of),
    }
