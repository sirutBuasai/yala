"""Transfers ledger domain."""

from __future__ import annotations

from decimal import Decimal
from pathlib import Path

from yala.ledger import Ledger

FIXTURES = Path(__file__).parent / "fixtures"


def _transfers(name="transfers_mini.beancount"):
    return Ledger(FIXTURES / name).load().transfers


def test_only_two_leg_own_account_moves_are_transfers():
    ts = _transfers().transactions()
    assert [(t.payee, t.from_account, t.to_account, t.amount) for t in ts] == [
        ("card autopay", "Assets:Cash:BankA", "Liabilities:CC:CardA", Decimal("250.00")),
        ("venmo sweep", "Assets:Cash:BankA", "Assets:Cash:Passthrough", Decimal("30.00")),
    ]


def test_excludes_paycheck_spending_equity_and_multileg():
    payees = {t.payee for t in _transfers().transactions()}
    assert "employer" not in payees  # has an Income leg
    assert "grocery" not in payees  # has an Expenses leg
    assert "seed" not in payees  # touches Equity
    assert "split move" not in payees  # three legs


def test_month_filter():
    assert len(_transfers().transactions(2025, 8)) == 2
    assert _transfers().transactions(2025, 7) == []
