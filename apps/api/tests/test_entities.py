"""Entity wrappers (``Posting``/``Transaction``) and the ``leaf`` account-name helper."""

from __future__ import annotations

import datetime as dt
from decimal import Decimal

from yala.ledger.entities import Posting, Transaction, leaf


def _txn(postings, meta=None, flag="*"):
    return Transaction(
        date=dt.date(2025, 8, 2), payee="example", postings=postings, meta=meta or {}, flag=flag
    )


def test_leaf_returns_last_segment():
    assert leaf("Assets:Cash:BofA") == "BofA"
    assert leaf("Solo") == "Solo"


def test_source_is_the_most_negative_non_expense_posting():
    t = _txn(
        [
            Posting("Expenses:Grocery", Decimal("40")),
            Posting("Liabilities:CC:CardA", Decimal("-40")),
        ]
    )
    assert t.source == "Liabilities:CC:CardA"


def test_source_honors_funding_meta():
    t = _txn(
        [
            Posting("Expenses:Grocery", Decimal("40")),
            Posting("Assets:Cash:Wallet", Decimal("10")),
            Posting("Liabilities:CC:CardA", Decimal("-50")),
        ],
        meta={"funding": "Assets:Cash:Wallet"},
    )
    assert t.source == "Assets:Cash:Wallet"


def test_source_is_none_without_a_non_expense_posting():
    assert _txn([Posting("Expenses:Grocery", Decimal("5"))]).source is None


def test_bill_reads_the_bill_meta_number():
    assert _txn([], meta={"bill": Decimal("300.00")}).bill == Decimal("300.00")
    assert _txn([]).bill is None


def test_pending_reflects_the_beancount_flag():
    assert _txn([], flag="!").pending is True
    assert _txn([], flag="*").pending is False


def test_locator_property_prefers_id():
    assert _txn([], meta={"id": "abc"}).locator == "id:abc"
