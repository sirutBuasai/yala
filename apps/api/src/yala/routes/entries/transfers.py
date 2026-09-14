"""Transfers: money moved between the owner's own accounts, with no Expenses or Income leg.

That absence is what makes the read domains classify a transfer as neither spending nor income.
"""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, model_validator

from yala import projections
from yala.ledger.locators import find_entry
from yala.routes.common import (
    Amount,
    Text,
    dec,
    ledger,
    ok,
    parse_date,
    parse_date_opt,
    reconcile_sweeps,
    sink,
    valid_money_account,
)
from yala.routes.entries.shared import reject_if_sweep
from yala.routes.errors import api_errors

router = APIRouter()


class TransferIn(BaseModel):
    date: str | None = None
    payee: Text = "payment"
    from_account: str
    to_account: str
    amount: Amount
    pending: bool = False

    @model_validator(mode="after")
    def _distinct_accounts(self) -> "TransferIn":
        if self.from_account == self.to_account:
            raise ValueError("from_account and to_account must differ")
        return self


class TransferUpdateIn(TransferIn):
    """An add body plus the locator of the transfer to replace."""

    locator: str


@router.get("/api/transfer")
def get_transfer(locator: str) -> dict:
    with api_errors():
        return projections.transfer_state(find_entry(ledger().entries, locator))


@router.post("/api/transfer")
def post_transfer(body: TransferIn) -> dict:
    with api_errors():
        valid_money_account(body.from_account)
        valid_money_account(body.to_account)

        date = parse_date(body.date)
        entry_id = sink().append_transfer(
            date=date,
            from_account=body.from_account,
            to_account=body.to_account,
            amount=dec(body.amount),
            payee=body.payee,
            pending=body.pending,
        )
        reconcile_sweeps(date)

    return ok(f"appended transfer {body.from_account} -> {body.to_account}", id=entry_id)


@router.post("/api/transfer/update")
def post_transfer_update(body: TransferUpdateIn) -> dict:
    with api_errors():
        valid_money_account(body.from_account)
        valid_money_account(body.to_account)

        old = find_entry(ledger().entries, body.locator)
        reject_if_sweep(old)
        old_date = old.date

        new_date = parse_date_opt(body.date)
        entry_id = sink().update_transfer(
            body.locator,
            date=new_date,
            from_account=body.from_account,
            to_account=body.to_account,
            amount=dec(body.amount),
            payee=body.payee,
            pending=body.pending,
        )
        reconcile_sweeps(old_date, new_date or old_date)

    return ok("updated transfer", id=entry_id)
