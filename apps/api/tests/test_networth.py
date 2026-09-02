"""Net-worth domain, the ``log_balance`` sink write, and the ``/api/balance`` endpoint."""

from __future__ import annotations

import datetime as dt
import shutil
from decimal import Decimal
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from yala import config
from yala.api import app
from yala.ledger import Ledger
from yala.ledger.networth import adjustment_account
from yala.sink import FileLedgerSink

FIXTURE_LEDGER = Path(__file__).parent / "fixtures" / "ledger"
SEP = dt.date(2026, 9, 1)


@pytest.fixture
def ledger_dir(tmp_path: Path) -> Path:
    dst = tmp_path / "ledger"
    shutil.copytree(FIXTURE_LEDGER, dst)
    return dst


def _load(ledger_dir: Path) -> Ledger:
    led = Ledger(ledger_dir / "main.beancount", strict=True).load()
    assert led.errors == []
    return led


# --- adjustment_account mapping (pure) ---


def test_adjustment_account_mapping():
    assert adjustment_account("Assets:Cash:Ally") == "Equity:Adjustments:Ally"
    assert (
        adjustment_account("Assets:Investments:Taxable:Schwab")
        == "Equity:Adjustments:Investments:Schwab"
    )
    assert (
        adjustment_account("Assets:Investments:TaxAdvantaged:FidelityHSA")
        == "Equity:Adjustments:Investments:FidelityHSA"
    )
    # a colon-nested account keeps its full path below the tax tier
    assert (
        adjustment_account("Assets:Investments:TaxAdvantaged:HSA:Broker1")
        == "Equity:Adjustments:Investments:HSA:Broker1"
    )


def test_adjustment_account_rejects_non_balance_sheet():
    with pytest.raises(ValueError):
        adjustment_account("Liabilities:CC:CardA")


# --- log_balance: USD account (no conversion) ---


def test_log_balance_usd_account_pads_to_asserted_value(ledger_dir: Path):
    account = "Assets:Cash:BankA"
    FileLedgerSink(ledger_dir).log_balance(
        account, Decimal("1000.00"), SEP, adjustment_account(account)
    )

    led = _load(ledger_dir)
    assert led.balance(account, SEP) == Decimal("1000.00")
    # the untracked delta lands in the account's own adjustment plug (non-zero)
    assert led.balance("Equity:Adjustments:BankA", SEP) != 0

    text = (ledger_dir / "assets" / "2026.beancount").read_text()
    assert "2026-08-31 pad Assets:Cash:BankA Equity:Adjustments:BankA" in text
    assert "2026-09-01 balance Assets:Cash:BankA" in text


# --- log_balance: share account (reclassify to USD, then assert) ---


def _write_share_ledger(root: Path) -> Path:
    root.mkdir(parents=True, exist_ok=True)
    (root / "main.beancount").write_text(
        'option "operating_currency" "USD"\n'
        "2020-01-01 commodity USD\n"
        "2020-01-01 commodity VOO\n"
        "2020-01-01 open Assets:Investments:Taxable:Brokerage\n"
        "2020-01-01 open Equity:Opening-Balances\n"
        "2020-01-01 open Equity:Adjustments:Investments:Brokerage\n"
        "2026-08-19 pad Assets:Investments:Taxable:Brokerage Equity:Opening-Balances\n"
        "2026-08-20 balance Assets:Investments:Taxable:Brokerage  10 VOO\n"
        "2026-08-20 price VOO 500.00 USD\n"
    )
    return root


def test_log_balance_reclassifies_shares_to_usd(tmp_path: Path):
    root = _write_share_ledger(tmp_path / "shares")
    account = "Assets:Investments:Taxable:Brokerage"

    # 10 VOO @ 500 = 5000 market; log a 5200 USD total.
    FileLedgerSink(root).log_balance(account, Decimal("5200.00"), SEP, adjustment_account(account))

    led = Ledger(root / "main.beancount", strict=True).load()
    assert led.errors == []
    # shares are gone; the account holds only the asserted USD (no double-count)
    assert led.holdings(account, SEP) == {"USD": Decimal("5200.00")}
    assert led.value(account, SEP) == Decimal("5200.00")
    # only the untracked delta (5200 - 5000) hit the adjustment plug — not the whole 5000 value
    assert led.balance("Equity:Adjustments:Investments:Brokerage", SEP) == Decimal("-200.00")


# --- NetWorth domain ---


def test_networth_series_and_adjustments(ledger_dir: Path):
    sink = FileLedgerSink(ledger_dir)
    sink.log_balance("Assets:Cash:BankA", Decimal("1000.00"), SEP, "Equity:Adjustments:BankA")
    sink.log_balance(
        "Assets:Investments:TaxAdvantaged:Employer401k",
        Decimal("2000.00"),
        SEP,
        "Equity:Adjustments:Investments:Employer401k",
    )

    nw = _load(ledger_dir).net_worth
    series = nw.series()
    assert [p.month for p in series] == ["2026-09"]
    point = series[0]
    assert point.net_worth == point.assets - point.liabilities

    labels = {a.label for a in nw.adjustments() if a.value != 0}
    assert {"BankA", "Investments:Employer401k"} <= labels


def test_loggable_accounts_excludes_swept(ledger_dir: Path):
    loggable = _load(ledger_dir).net_worth.loggable_accounts()
    assert "Assets:Cash:BankA" in loggable
    # Venmo sweeps to Wealthfront and has no adjustment plug → not loggable
    assert "Assets:Cash:Venmo" not in loggable


# --- /api/balance endpoint ---


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    ledger_dir = tmp_path / "ledger"
    shutil.copytree(FIXTURE_LEDGER, ledger_dir)
    monkeypatch.setattr(config, "LEDGER_DIR", ledger_dir)
    monkeypatch.setattr(config, "MAIN_LEDGER", ledger_dir / "main.beancount")
    return TestClient(app)


def test_post_balance_logs_and_shows_in_data(client: TestClient):
    r = client.post(
        "/api/balance",
        json={"account": "Assets:Cash:BankA", "amount": 1000.0, "date": "2026-09-01"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["ok"] is True

    nw = client.get("/api/data").json()["networth"]
    assert nw["current"] is not None
    assert any(a["label"] == "BankA" for a in nw["adjustments"])


def test_post_balance_rejects_non_balance_sheet_account(client: TestClient):
    r = client.post("/api/balance", json={"account": "Expenses:Grocery", "amount": 100.0})
    assert r.status_code == 422


def test_balance_accounts_listed_in_accounts(client: TestClient):
    body = client.get("/api/accounts").json()
    assert "Assets:Cash:BankA" in body["balance_accounts"]
