"""Spending ledger domain."""

from __future__ import annotations

from decimal import Decimal
from pathlib import Path

import pytest

from yala.ledger import Ledger

FIXTURES = Path(__file__).parent / "fixtures"


def _spending(name="mini.beancount"):
    return Ledger(FIXTURES / name).load().spending


def test_category_totals_net_of_reimbursement():
    s = _spending()
    totals = s.by_category(2025, 8)
    assert totals["Takeouts"] == Decimal("18.72")
    assert totals["Grocery"] == Decimal("40.00")  # 50 - 10 reimbursement
    assert s.total(2025, 8) == Decimal("58.72")


def test_transaction_fields():
    t = _spending().transactions(2025, 8, category="Takeouts")[0]
    assert t.payee == "Example Cafe"
    assert t.category == "Takeouts"
    assert t.source == "Liabilities:CC:CardA"  # funding account, not a src label
    assert t.amount == Decimal("18.72")
    assert t.pending is False


def test_coverage_helpers():
    s = _spending()
    assert s.years() == [2025]
    assert s.months() == [(2025, 8)]
    assert s.count() == 3
    assert s.categories() == ["Grocery", "Takeouts"]
    rng = s.date_range()
    assert rng is not None
    lo, hi = rng
    assert (lo.isoformat(), hi.isoformat()) == ("2025-08-02", "2025-08-19")


def test_pending_flag_is_read_from_beancount():
    t = _spending("pending.beancount").transactions()[0]
    assert t.pending is True
    assert t.source == "Liabilities:CC:CardA"


def test_one_category_invariant_is_enforced():
    with pytest.raises(ValueError, match="only one category"):
        _spending("multi_category.beancount").by_category()


def test_empty_ledger_is_queryable():
    s = _spending("empty.beancount")
    assert s.years() == []
    assert s.months() == []
    assert s.count() == 0
    assert s.date_range() is None
    assert s.categories() == ["Grocery"]
