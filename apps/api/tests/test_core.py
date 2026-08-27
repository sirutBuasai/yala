"""Core ledger access: load, error handling, currency, and account listings."""

from __future__ import annotations

from pathlib import Path

import pytest

from yala.ledger import Ledger, LedgerError

FIXTURES = Path(__file__).parent / "fixtures"
FIXTURE_LEDGER = FIXTURES / "ledger" / "main.beancount"


def _ledger(name="mini.beancount", **kw):
    return Ledger(FIXTURES / name, **kw).load()


def test_loads_without_errors_and_reads_declared_accounts():
    led = _ledger()
    assert led.errors == []
    assert len(led.transactions()) == 3
    assert led.declared_accounts("Expenses:") == ["Expenses:Grocery", "Expenses:Takeouts"]


def test_load_raises_on_ledger_errors_by_default():
    with pytest.raises(LedgerError):
        _ledger("broken.beancount")


def test_non_strict_load_collects_errors_without_raising():
    led = Ledger(FIXTURES / "broken.beancount", strict=False).load()
    assert len(led.errors) >= 1  # unopened account


def test_currency_defaults_to_usd_without_commodity():
    assert _ledger("no_commodity.beancount").currency == "USD"


def test_load_raises_file_not_found_for_missing_path():
    with pytest.raises(FileNotFoundError):
        Ledger(FIXTURES / "does_not_exist.beancount").load()


def test_queries_lazy_load_without_explicit_load_call():
    led = Ledger(FIXTURES / "mini.beancount")
    assert len(led.transactions()) == 3


def test_transactions_filter_by_year_and_month():
    led = _ledger()
    assert len(led.transactions(2025, 8)) == 3
    assert led.transactions(2024) == []


def test_active_accounts_excludes_closed():
    active = Ledger(FIXTURE_LEDGER).load().active_accounts("Liabilities:CC:")
    assert "Liabilities:CC:CardA" in active
    assert "Liabilities:CC:CardD" not in active  # closed 2024-10-01


def test_account_meta_strips_source_location_and_keeps_declared_meta():
    meta = Ledger(FIXTURE_LEDGER).load().account_meta()
    k401 = meta["Assets:Investments:TaxAdvantaged:Employer401k"]
    assert "filename" not in k401 and "lineno" not in k401
    assert k401["employer"] == "Employer1"
    assert k401["labels"] == "Roth401k,Trad401k,AfterTax401k"
