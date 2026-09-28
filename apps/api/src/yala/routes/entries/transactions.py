"""Spending transactions: one ``Expenses:*`` category, any reimbursements, one funding account."""

from __future__ import annotations

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
    sink,
    valid_money_account,
    valid_name,
)
from yala.routes.entries.shared import appended, replaced
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
    #: Posted at the bank, pending only until a reimbursement lands.
    awaiting_reimbursement: bool = False
    credits: list[CreditIn] = Field(default=[], max_length=MAX_LEGS)


class TransactionUpdateIn(TransactionIn):
    locator: str


def _state(body: TransactionIn) -> dict:
    """The validated fields a spending write takes, beyond its date."""
    valid_name(body.category)
    valid_money_account(body.funding_account)
    # A refund arrives in a bank account or against a card, never in a category.
    credits = [(valid_money_account(c.account), dec(c.amount)) for c in body.credits]

    return {
        "payee": body.payee,
        "amount": dec(body.amount),
        "category": body.category,
        "funding_account": body.funding_account,
        "pending": body.pending,
        "awaiting": body.awaiting_reimbursement,
        "credits": credits,
    }


@router.get("/api/transaction")
def get_transaction(locator: str) -> dict:
    with api_errors():
        return projections.txn_state(find_entry(ledger().entries, locator))


@router.post("/api/transaction")
def post_transaction(body: TransactionIn) -> dict:
    with api_errors():
        state = _state(body)
        entry_id = appended(body.date, lambda on: sink().append_transaction(date=on, **state))

    return ok(f"appended transaction for {body.payee}", id=entry_id)


@router.post("/api/transaction/update")
def post_transaction_update(body: TransactionUpdateIn) -> dict:
    with api_errors():
        state = _state(body)
        entry_id = replaced(
            body.locator,
            body.date,
            ledger(),
            lambda on: sink().update_transaction(body.locator, date=on, **state),
        )

    return ok(f"updated transaction for {body.payee}", id=entry_id)
