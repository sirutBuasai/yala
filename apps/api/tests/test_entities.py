"""Entity wrappers + account-name helpers (shared across every ledger domain)."""

from __future__ import annotations

import datetime as dt
from decimal import Decimal

from yala import config
from yala.ledger.entities import Posting, Transaction, leaf, ledger_relative, locator_of


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


def test_locator_prefers_id_then_falls_back_to_line():
    assert _txn([], meta={"id": "abc"}).locator == "id:abc"
    assert locator_of({"id": "abc"}) == "id:abc"


def test_line_locator_is_ledger_relative(monkeypatch, tmp_path):
    monkeypatch.setattr(config, "LEDGER_DIR", tmp_path)
    meta = {"filename": str(tmp_path / "spending" / "2025.beancount"), "lineno": 7}
    assert locator_of(meta) == "line:spending/2025.beancount:7"
    assert ledger_relative(str(tmp_path / "accounts.beancount")) == "accounts.beancount"
