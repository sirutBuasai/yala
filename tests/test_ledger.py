import datetime as dt
from decimal import Decimal
from pathlib import Path

import pytest

from yala.ledger import Ledger, LedgerError
from yala.ledger.entities import Posting, Transaction

FIXTURES = Path(__file__).parent / "fixtures"


def _ledger(name="mini.beancount", **kw):
    return Ledger(FIXTURES / name, **kw).load()


def test_loads_without_errors():
    led = _ledger()
    assert led.errors == []
    assert len(led.transactions()) == 3
    assert led.declared_accounts("Expenses:") == [
        "Expenses:Grocery",
        "Expenses:Takeouts",
    ]


def test_load_raises_on_ledger_errors_by_default():
    with pytest.raises(LedgerError):
        _ledger("broken.beancount")


def test_non_strict_load_collects_errors_without_raising():
    led = Ledger(FIXTURES / "broken.beancount", strict=False).load()
    assert len(led.errors) >= 1  # unopened account


def test_spending_category_totals():
    s = _ledger().spending
    totals = s.by_category(2025, 8)
    assert totals["Takeouts"] == Decimal("18.72")
    assert totals["Grocery"] == Decimal("40.00")  # 50 - 10 reimbursement
    assert s.total(2025, 8) == Decimal("58.72")


def test_spending_transaction_fields():
    s = _ledger().spending
    txns = s.transactions(2025, 8, category="Takeouts")
    assert len(txns) == 1
    t = txns[0]
    assert t.payee == "Example Cafe"
    assert t.category == "Takeouts"
    assert t.source == "Liabilities:CC:CardA"  # funding account, not a src label
    assert t.amount == Decimal("18.72")
    assert t.pending is False


def test_spending_coverage_helpers():
    s = _ledger().spending
    assert s.years() == [2025]
    assert s.months() == [(2025, 8)]
    assert s.count() == 3
    assert s.categories() == ["Grocery", "Takeouts"]
    rng = s.date_range()
    assert rng is not None
    lo, hi = rng
    assert (lo.isoformat(), hi.isoformat()) == ("2025-08-02", "2025-08-19")


def test_pending_flag_is_read_from_beancount():
    t = _ledger("pending.beancount").spending.transactions()[0]
    assert t.pending is True
    assert t.source == "Liabilities:CC:CardA"


def test_one_category_invariant_is_enforced():
    s = _ledger("multi_category.beancount").spending
    with pytest.raises(ValueError, match="only one category"):
        s.by_category()


def test_empty_ledger_is_queryable():
    s = _ledger("empty.beancount").spending
    assert s.years() == []
    assert s.months() == []
    assert s.count() == 0
    assert s.date_range() is None
    assert s.categories() == ["Grocery"]


def test_currency_defaults_to_usd_without_commodity():
    assert _ledger("no_commodity.beancount").currency == "USD"


def test_load_raises_file_not_found_for_missing_path():
    with pytest.raises(FileNotFoundError):
        Ledger(FIXTURES / "does_not_exist.beancount").load()


def test_queries_lazy_load_without_explicit_load_call():
    # Never call .load(); accessing a query triggers _require() -> load().
    led = Ledger(FIXTURES / "mini.beancount")
    assert len(led.transactions()) == 3


def test_source_is_none_when_no_non_expense_posting():
    t = Transaction(
        date=dt.date(2025, 8, 2),
        payee="orphan expense",
        postings=[Posting("Expenses:Grocery", Decimal("5.00"))],
        meta={},
    )
    assert t.source is None
