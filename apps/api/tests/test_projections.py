"""Read-side projections: a raw beancount entry → the editable-state dict a GET endpoint returns."""

from __future__ import annotations

import datetime as dt
from decimal import Decimal

import pytest
from beancount.core import data
from beancount.core.amount import Amount
from fastapi import HTTPException

from yala import projections


def _posting(account: str, number, meta: dict | None = None) -> data.Posting:
    return data.Posting(account, Amount(Decimal(str(number)), "USD"), None, None, None, meta)


def _txn(postings, *, meta=None, flag="*", payee="example", narration=None) -> data.Transaction:
    return data.Transaction(
        meta or {}, dt.date(2025, 8, 2), flag, payee, narration, frozenset(), frozenset(), postings
    )


def test_txn_state_reports_category_funding_and_no_credits():
    entry = _txn(
        [_posting("Expenses:Grocery", 40), _posting("Liabilities:CC:CardA", -40)],
        meta={"id": "x1", "funding": "Liabilities:CC:CardA"},
    )
    s = projections.txn_state(entry)
    assert s["category"] == "Grocery"
    assert s["amount"] == 40.0
    assert s["net_expense"] == 40.0
    assert s["funding_account"] == "Liabilities:CC:CardA"
    assert s["credits"] == []
    assert s["bill"] is None
    assert s["locator"] == "id:x1"
    assert s["pending"] is False


def test_txn_state_splits_bill_into_net_share_and_credits():
    entry = _txn(
        [
            _posting("Expenses:Grocery", 30),
            _posting("Assets:Cash:Wallet", 10),
            _posting("Liabilities:CC:CardA", -40),
        ],
        meta={"id": "x2", "funding": "Liabilities:CC:CardA", "bill": Amount(Decimal("40"), "USD")},
    )
    s = projections.txn_state(entry)
    assert s["net_expense"] == 30.0
    assert s["amount"] == 40.0
    assert s["bill"] == 40.0
    assert s["credits"] == [{"account": "Assets:Cash:Wallet", "amount": 10.0}]


def test_txn_state_rejects_non_single_category_entry():
    entry = _txn([_posting("Assets:Cash:BankA", -50), _posting("Liabilities:CC:CardA", 50)])
    with pytest.raises(HTTPException):
        projections.txn_state(entry)


def test_transfer_state_reports_from_to_and_amount():
    entry = _txn(
        [_posting("Liabilities:CC:CardA", 50), _posting("Assets:Cash:BankA", -50)],
        meta={"id": "t1"},
        flag="!",
    )
    s = projections.transfer_state(entry)
    assert s["from_account"] == "Assets:Cash:BankA"
    assert s["to_account"] == "Liabilities:CC:CardA"
    assert s["amount"] == 50.0
    assert s["pending"] is True


def test_transfer_state_rejects_non_two_leg_entry():
    with pytest.raises(HTTPException):
        projections.transfer_state(_txn([_posting("Assets:Cash:BankA", -50)]))


def test_paycheck_state_summarizes_employer_gross_and_deposit():
    entry = _txn(
        [
            _posting("Income:Salary:Amazon", -1000),
            _posting("Expenses:Deductions:Tax", 200),
            _posting("Assets:Investments:HSA", 100),
            _posting("Assets:Cash:BankA", 700),
        ],
        meta={"id": "p1"},
        payee="paycheck",
    )
    s = projections.paycheck_state(entry, {})
    assert s["employer"] == "Amazon"
    assert s["gross"] == 1000.0
    assert s["deposit_account"] == "Assets:Cash:BankA"
    assert s["deductions"] == {"Tax": 200.0}
    assert s["contributions"] == {"HSA": 100.0}


def test_paycheck_state_rejects_non_paycheck_entry():
    entry = _txn([_posting("Expenses:Grocery", 40), _posting("Liabilities:CC:CardA", -40)])
    with pytest.raises(HTTPException):
        projections.paycheck_state(entry, {})
