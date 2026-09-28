"""No Expenses or Income leg, so the read domains count a transfer as neither."""

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
    sink,
    valid_money_account,
)
from yala.routes.entries.shared import appended, reject_if_sweep, replaced
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
    locator: str


def _state(body: TransferIn) -> dict:
    """The validated fields a transfer write takes, beyond its date."""
    return {
        "from_account": valid_money_account(body.from_account),
        "to_account": valid_money_account(body.to_account),
        "amount": dec(body.amount),
        "payee": body.payee,
        "pending": body.pending,
    }


@router.get("/api/transfer")
def get_transfer(locator: str) -> dict:
    with api_errors():
        return projections.transfer_state(find_entry(ledger().entries, locator))


@router.post("/api/transfer")
def post_transfer(body: TransferIn) -> dict:
    with api_errors():
        state = _state(body)
        entry_id = appended(body.date, lambda on: sink().append_transfer(date=on, **state))

    return ok(f"appended transfer {body.from_account} -> {body.to_account}", id=entry_id)


@router.post("/api/transfer/update")
def post_transfer_update(body: TransferUpdateIn) -> dict:
    with api_errors():
        state = _state(body)
        led = ledger()
        reject_if_sweep(find_entry(led.entries, body.locator), led)
        entry_id = replaced(
            body.locator,
            body.date,
            led,
            lambda on: sink().update_transfer(body.locator, date=on, **state),
        )

    return ok("updated transfer", id=entry_id)
