"""Line items come from the named employer; see :mod:`yala.ledger.payroll`."""

from __future__ import annotations

from decimal import Decimal

from fastapi import APIRouter
from pydantic import BaseModel, Field

from yala import projections
from yala.ledger import Ledger, payroll
from yala.ledger.locators import find_entry
from yala.routes.common import (
    MAX_LEGS,
    Amount,
    NonNegAmount,
    Text,
    dec,
    ledger,
    ok,
    sink,
    valid_money_account,
)
from yala.routes.entries.shared import appended, replaced
from yala.routes.errors import api_errors, invalid

router = APIRouter()


class PaycheckIn(BaseModel):
    date: str | None = None
    employer: str
    gross: Amount
    deductions: dict[str, NonNegAmount] = Field(default={}, max_length=MAX_LEGS)
    contributions: dict[str, NonNegAmount] = Field(default={}, max_length=MAX_LEGS)
    deposit_account: str
    payee: Text = "paycheck"


class PaycheckUpdateIn(PaycheckIn):
    """An add body plus the locator of the paycheck to replace."""

    locator: str


def _state(body: PaycheckIn, led: Ledger) -> dict:
    """The validated fields a paycheck write takes, beyond its date; 422 on an unknown employer or
    an unoffered line item."""
    valid_money_account(body.deposit_account)

    if body.employer not in payroll.employers(led):
        raise invalid(f"unknown or inactive employer: {body.employer!r}")

    def legs(kind: str, items: dict[str, float]) -> list[tuple[payroll.PayrollOption, Decimal]]:
        out = []
        for label, amount in items.items():
            option = payroll.resolve(led, kind, label, body.employer)
            if option is None:
                raise invalid(f"no {kind} {label!r} for {body.employer}")
            out.append((option, dec(amount)))
        return out

    return {
        "gross": dec(body.gross),
        "income_account": f"{payroll.SALARY}{body.employer}",
        "deduction_legs": [(o.account, amount) for o, amount in legs("deduction", body.deductions)],
        "contribution_legs": [
            (o.account, o.label, amount) for o, amount in legs("contribution", body.contributions)
        ],
        "deposit_account": body.deposit_account,
        "payee": body.payee,
    }


@router.get("/api/paycheck")
def get_paycheck(locator: str) -> dict:
    with api_errors():
        led = ledger()
        return projections.paycheck_state(find_entry(led.entries, locator), led.account_meta())


@router.post("/api/paycheck")
def post_paycheck(body: PaycheckIn) -> dict:
    with api_errors():
        state = _state(body, ledger())
        appended(body.date, lambda on: sink().append_paycheck(date=on, **state))

    return ok(f"appended paycheck dated {body.date or 'today'}")


@router.post("/api/paycheck/update")
def post_paycheck_update(body: PaycheckUpdateIn) -> dict:
    with api_errors():
        led = ledger()
        state = _state(body, led)
        entry_id = replaced(
            body.locator,
            body.date,
            led,
            lambda on: sink().update_paycheck(body.locator, date=on, **state),
        )

    return ok("updated paycheck", id=entry_id)
