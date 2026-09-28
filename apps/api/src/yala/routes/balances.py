"""Net-worth snapshots: logging a balance, correcting one, and reading a past date's figures."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter
from pydantic import BaseModel, Field

from yala.ledger.accounts import snapshot_plug
from yala.ledger.constants import CASH, INVESTMENTS, LIABILITIES
from yala.ledger.networth import LoggedBalance
from yala.routes.common import (
    MAX_LEGS,
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


def _loggable(account: str) -> str:
    valid_name(account)
    if not account.startswith((CASH, INVESTMENTS, LIABILITIES)):
        raise invalid(f"not a balance-loggable account: {account!r}")
    return account


@router.post("/api/balance")
def post_balance(body: BalanceIn) -> dict:
    """Unexplained differences go to the plug (see :func:`snapshot_plug`). A card past its baseline
    can't pad, so a disagreeing figure is refused, naming the gap."""
    account = _loggable(body.account)
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


class ReadingIn(BaseModel):
    account: str
    amount: SignedAmount
    #: The snapshot standing on the reading date, to correct in place rather than stack a second.
    locator: str | None = None


class BalancesIn(BaseModel):
    date: str | None = None
    readings: Annotated[list[ReadingIn], Field(min_length=1, max_length=MAX_LEGS)]


@router.post("/api/balances")
def post_balances(body: BalancesIn) -> dict:
    """A whole sitting in one request: new readings land in one write, corrections each rewrite
    their own line. A refused reading is reported by account in ``failed`` while the rest save."""
    date = parse_date(body.date)
    accounts = [_loggable(r.account) for r in body.readings]
    if len(set(accounts)) != len(accounts):
        raise invalid("each account can be read only once per sitting")

    new = {r.account: dec(r.amount) for r in body.readings if r.locator is None}
    ids, failed = sink().log_balances(new, date, snapshot_plug)
    saved = {account: f"id:{entry_id}" for account, entry_id in ids.items()}
    touched = [date] if saved else []

    for r in body.readings:
        if r.locator is None:
            continue
        try:
            _, corrected, saved[r.account] = sink().update_balance(r.locator, dec(r.amount))
            touched.append(corrected)
        except (KeyError, ValueError) as e:
            failed[r.account] = str(e)

    reconcile_sweeps(*touched)

    return ok(f"logged {len(saved)} of {len(accounts)} balances", saved=saved, failed=failed)


class BalanceEditIn(BaseModel):
    locator: str
    amount: SignedAmount


@router.post("/api/balance/update")
def post_balance_update(body: BalanceEditIn) -> dict:
    """Rewrites the assertion's own line, since re-logging the date would stack a second one."""
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


def _snapshots(by_account: dict[str, LoggedBalance]) -> dict[str, dict]:
    return {
        account: {"date": b.date.isoformat(), "amount": float(b.amount), "locator": b.locator}
        for account, b in by_account.items()
    }


@router.get("/api/networth")
def get_networth_at(date: str) -> dict:
    """What the balance pane reads for a date, with handles to correct it in place. ``cards`` is
    each card's expected bank-app figure at the end of ``date``, as stored."""
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
        # Locators only where the snapshot can be rewritten; amounts as stored, so a liability's is
        # negative.
        "standing": _snapshots(nw.standing_at(as_of)),
        "previous": _snapshots(nw.previous_at(as_of)),
        "cards": {
            account: {
                "expected": float(c.expected),
                "must_agree": c.must_agree,
            }
            for account, c in nw.card_checks(as_of).items()
        },
    }
