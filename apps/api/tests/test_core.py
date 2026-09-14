"""Core ledger access: load, error handling, currency, and account listings."""

from __future__ import annotations

import datetime as dt
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


def test_open_close_dates_keeps_the_earliest_of_each():
    opened, closed = Ledger(FIXTURE_LEDGER).load().open_close_dates()

    assert opened["Liabilities:CC:CardC"] == dt.date(2026, 8, 14)
    assert closed["Liabilities:CC:CardD"] == dt.date(2024, 10, 1)
    assert "Liabilities:CC:CardA" not in closed


def test_active_accounts_can_be_read_as_of_a_past_date():
    """The dated view is what reconciliation needs: an account closed since is still active in the
    month it was swept."""
    led = Ledger(FIXTURE_LEDGER).load()

    assert "Liabilities:CC:CardD" in led.active_accounts(as_of=dt.date(2024, 1, 1))
    assert "Liabilities:CC:CardD" not in led.active_accounts(as_of=dt.date(2025, 1, 1))
    # an account is active from its own open date, not the day after
    assert "Liabilities:CC:CardC" in led.active_accounts(as_of=dt.date(2026, 8, 14))
    assert "Liabilities:CC:CardC" not in led.active_accounts(as_of=dt.date(2026, 8, 13))
