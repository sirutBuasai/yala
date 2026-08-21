from decimal import Decimal
from pathlib import Path

from yala.ledger import Ledger

FIXTURE = Path(__file__).parent / "fixtures" / "mini.beancount"


def _ledger():
    return Ledger(FIXTURE).load()


def test_loads_without_errors():
    led = _ledger()
    assert led.errors == []
    assert led.count() == 3
    assert led.years() == [2025]


def test_category_totals():
    led = _ledger()
    totals = led.category_totals(2025, 8)
    assert totals["Takeouts"] == Decimal("18.72")
    assert totals["Grocery"] == Decimal("40.00")  # 50 - 10 reimbursement
    assert led.total_spending(2025, 8) == Decimal("58.72")


def test_transaction_fields():
    led = _ledger()
    txns = led.transactions(2025, 8, category="Takeouts")
    assert len(txns) == 1
    t = txns[0]
    assert t.payee == "japan cafe"
    assert t.category == "Takeouts"
    assert t.source == "Amex Gold"
    assert t.amount == Decimal("18.72")


def test_filter_by_month_returns_empty_for_other_month():
    led = _ledger()
    assert led.transactions(2025, 7) == []
