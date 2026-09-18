"""Paychecks: gross in, deductions and contributions out, the rest deposited.

The line items a paycheck may carry come from the employer it names — see
:mod:`yala.ledger.payroll`.
"""

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
    parse_date,
    parse_date_opt,
    reconcile_sweeps,
    sink,
    valid_money_account,
)
from yala.routes.entries.shared import entry_date
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


def _resolve_paycheck(
    body: PaycheckIn, led: Ledger
) -> tuple[str, list[tuple[str, Decimal]], list[tuple[str, str | None, Decimal]]]:
    """Resolve an employer + option-labeled maps into concrete ledger legs.

    Returns ``(income_account, deduction_legs, contribution_legs)``; raises 422 on an unknown
    employer or a line item the selected employer doesn't offer.
    """
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

    return (
        f"{payroll.SALARY}{body.employer}",
        [(o.account, amount) for o, amount in legs("deduction", body.deductions)],
        [(o.account, o.label, amount) for o, amount in legs("contribution", body.contributions)],
    )


@router.get("/api/paycheck")
def get_paycheck(locator: str) -> dict:
    with api_errors():
        led = ledger()
        return projections.paycheck_state(find_entry(led.entries, locator), led.account_meta())


@router.post("/api/paycheck")
def post_paycheck(body: PaycheckIn) -> dict:
    with api_errors():
        income_account, deduction_legs, contribution_legs = _resolve_paycheck(body, ledger())

        date = parse_date(body.date)
        sink().append_paycheck(
            date=date,
            gross=dec(body.gross),
            income_account=income_account,
            deduction_legs=deduction_legs,
            contribution_legs=contribution_legs,
            deposit_account=body.deposit_account,
            payee=body.payee,
        )
        reconcile_sweeps(date)

    return ok(f"appended paycheck dated {body.date or 'today'}")


@router.post("/api/paycheck/update")
def post_paycheck_update(body: PaycheckUpdateIn) -> dict:
    with api_errors():
        income_account, deduction_legs, contribution_legs = _resolve_paycheck(body, ledger())

        old_date = entry_date(body.locator)
        new_date = parse_date_opt(body.date)
        entry_id = sink().update_paycheck(
            body.locator,
            date=new_date,
            gross=dec(body.gross),
            income_account=income_account,
            deduction_legs=deduction_legs,
            contribution_legs=contribution_legs,
            deposit_account=body.deposit_account,
            payee=body.payee,
        )
        reconcile_sweeps(old_date, new_date or old_date)

    return ok("updated paycheck", id=entry_id)
