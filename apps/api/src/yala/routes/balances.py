"""Net-worth snapshots: logging a sitting of balances, and reading a past date's figures."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter
from pydantic import BaseModel, Field

from yala.ledger import LedgerError
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
from yala.routes.errors import invalid

router = APIRouter()


def _loggable(account: str) -> str:
    valid_name(account)
    if not account.startswith((CASH, INVESTMENTS, LIABILITIES)):
        raise invalid(f"not a balance-loggable account: {account!r}")
    return account


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
        # A correction the strict reload rejects is refused like any other, not a failed request.
        except (KeyError, ValueError, LedgerError) as e:
            failed[r.account] = str(e)

    reconcile_sweeps(*touched)

    return ok(f"logged {len(saved)} of {len(accounts)} balances", saved=saved, failed=failed)


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
