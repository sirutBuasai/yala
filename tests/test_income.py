"""Income ledger domain."""

from __future__ import annotations

from decimal import Decimal
from pathlib import Path

from yala.ledger import Ledger

FIXTURES = Path(__file__).parent / "fixtures"


def _income(name="income_mini.beancount"):
    return Ledger(FIXTURES / name).load().income


def test_income_ignores_spending_and_reads_paychecks():
    inc = _income()
    pcs = inc.paychecks()
    assert len(pcs) == 2  # the spending txn is not a paycheck
    # net = gross - direct out (tax + insurance); take-home = gross - all out.
    assert inc.net(2025) == Decimal("2300.00")        # 3000 - (600 tax + 100 insurance)
    assert inc.take_home(2025) == Decimal("1550.00")  # 2300 - (150 hsa + 600 401k)
    assert inc.gross(2025) == Decimal("3000.00")


def test_income_categories_from_declared_accounts():
    inc = _income()
    # types are discovered from the opened accounts, not hardcoded
    assert inc.deduction_categories() == ["Insurance", "Tax"]
    assert inc.contribution_categories() == ["401k", "HSA"]


def test_income_rollups_and_by_month():
    inc = _income()
    assert inc.deductions(2025) == {"Tax": Decimal("600.00"), "Insurance": Decimal("100.00")}
    assert inc.contributions(2025) == {"HSA": Decimal("150.00"), "401k": Decimal("600.00")}
    by_month = inc.by_month(2025)                # net (money that stayed yours) per month
    assert len(by_month) == 12
    assert by_month[0] == Decimal("750.00")   # January  (1000 - 250 direct)
    assert by_month[1] == Decimal("1550.00")  # February (2000 - 450 direct)
    assert by_month[2] == Decimal("0")        # March


def test_income_paycheck_fields():
    p = _income().paychecks(2025, 2)[0]
    assert p.gross == Decimal("2000.00")
    assert p.deductions == {"Tax": Decimal("400.00"), "Insurance": Decimal("50.00")}
    assert p.contributions == {"HSA": Decimal("100.00"), "401k": Decimal("400.00")}
    assert p.net == Decimal("1550.00")        # gross - direct out
    assert p.take_home == Decimal("1050.00")  # gross - all out
