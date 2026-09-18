"""Spending transactions: one ``Expenses:*`` category, any reimbursements, one funding account."""

from __future__ import annotations

from decimal import Decimal

from fastapi import APIRouter
from pydantic import BaseModel, Field

from yala import projections
from yala.ledger.locators import find_entry
from yala.routes.common import (
    MAX_LEGS,
    Amount,
    NonZeroAmount,
    Text,
    dec,
    ledger,
    ok,
    parse_date,
    parse_date_opt,
    reconcile_sweeps,
    sink,
    valid_money_account,
    valid_name,
)
from yala.routes.entries.shared import entry_date
from yala.routes.errors import api_errors

router = APIRouter()


class CreditIn(BaseModel):
    account: str
    amount: Amount


class TransactionIn(BaseModel):
    date: str | None = None
    payee: Text
    amount: NonZeroAmount
    category: str
    funding_account: str
    pending: bool = False
    credits: list[CreditIn] = Field(default=[], max_length=MAX_LEGS)


class TransactionUpdateIn(TransactionIn):
    """An add body plus the locator of the entry to replace."""

    locator: str


def _credits(credits: list[CreditIn]) -> list[tuple[str, Decimal]]:
    """Resolve the reimbursement legs. Each lands in an account that holds money — a refund arrives
    in a bank account or against a card, never in a category."""
    return [(valid_money_account(c.account), dec(c.amount)) for c in credits]


@router.get("/api/transaction")
def get_transaction(locator: str) -> dict:
    with api_errors():
        return projections.txn_state(find_entry(ledger().entries, locator))


@router.post("/api/transaction")
def post_transaction(body: TransactionIn) -> dict:
    with api_errors():
        valid_name(body.category)
        valid_money_account(body.funding_account)

        date = parse_date(body.date)
        entry_id = sink().append_transaction(
            date=date,
            payee=body.payee,
            amount=dec(body.amount),
            category=body.category,
            funding_account=body.funding_account,
            pending=body.pending,
            credits=_credits(body.credits),
        )
        reconcile_sweeps(date)

    return ok(f"appended transaction for {body.payee}", id=entry_id)


@router.post("/api/transaction/update")
def post_transaction_update(body: TransactionUpdateIn) -> dict:
    with api_errors():
        valid_name(body.category)
        valid_money_account(body.funding_account)

        old_date = entry_date(body.locator)
        new_date = parse_date_opt(body.date)
        entry_id = sink().update_transaction(
            body.locator,
            date=new_date,
            payee=body.payee,
            amount=dec(body.amount),
            category=body.category,
            funding_account=body.funding_account,
            pending=body.pending,
            credits=_credits(body.credits),
        )
        reconcile_sweeps(old_date, new_date or old_date)

    return ok(f"updated transaction for {body.payee}", id=entry_id)
