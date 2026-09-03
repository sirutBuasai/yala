"""Add/close investment accounts: currency constraint, genesis seed + plug, meta, and the
value-to-USD split-drain retirement flow. Exercised through the API path."""

from __future__ import annotations

import datetime as dt
import shutil
import textwrap
from decimal import Decimal
from pathlib import Path

import pytest
from beancount.core import data
from fastapi.testclient import TestClient

from yala import config
from yala.api import app
from yala.ledger import Ledger

FIXTURE_LEDGER = Path(__file__).parent / "fixtures" / "ledger"

BANK_A = "Assets:Cash:BankA"
BANK_B = "Assets:Cash:BankB"
BROKERAGE = "Assets:Investments:Taxable:Brokerage"
BROKERAGE_PLUG = "Equity:Adjustments:Investments:Brokerage"
TICKER = "TICKA"


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    ledger_dir = tmp_path / "ledger"
    shutil.copytree(FIXTURE_LEDGER, ledger_dir)
    monkeypatch.setattr(config, "LEDGER_DIR", ledger_dir)
    monkeypatch.setattr(config, "MAIN_LEDGER", ledger_dir / "main.beancount")
    c = TestClient(app)
    c.ledger_dir = ledger_dir  # type: ignore[attr-defined]
    return c


def _ledger(client: TestClient) -> Ledger:
    return Ledger(client.ledger_dir / "main.beancount").load()  # type: ignore[attr-defined]


def _open_entry(led: Ledger, account: str) -> data.Open:
    return next(e for e in led.entries if isinstance(e, data.Open) and e.account == account)


def _append_ledger(client: TestClient, text: str) -> None:
    path = client.ledger_dir / "accounts.beancount"  # type: ignore[attr-defined]
    path.write_text(path.read_text() + textwrap.dedent(text))


def _seed_shares(client: TestClient, price: str = "500.00") -> None:
    """Give BROKERAGE a priced share holding (10 shares, bought from BANK_A)."""
    _append_ledger(
        client,
        f"""
        2020-01-01 commodity {TICKER}
        2026-01-01 open {BROKERAGE}
        2020-01-01 open {BROKERAGE_PLUG}
        2026-01-05 price {TICKER} {price} USD
        2026-01-05 * "buy"
          {BROKERAGE}  10 {TICKER} @ {price} USD
          {BANK_A}  -{Decimal(price) * 10} USD
        """,
    )


# --- add ---


def test_add_share_account_is_unconstrained_with_seed_and_plug(client: TestClient):
    r = client.post(
        "/api/investment",
        json={"subtree": "Taxable", "leaf": "AcctA", "holds_shares": True},
    )
    assert r.status_code == 200
    led = _ledger(client)
    account = "Assets:Investments:Taxable:AcctA"
    assert account in led.active_accounts()
    assert _open_entry(led, account).currencies is None  # unconstrained
    assert "Equity:Adjustments:Investments:AcctA" in led.active_accounts()
    assert any(isinstance(e, data.Balance) and e.account == account for e in led.entries)


def test_add_usd_only_plan_is_constrained_without_seed_or_plug(client: TestClient):
    r = client.post(
        "/api/investment",
        json={
            "subtree": "TaxAdvantaged",
            "leaf": "PlanA",
            "holds_shares": False,
            "employer": "EmployerA",
            "labels": ["OptionA", "OptionB"],
        },
    )
    assert r.status_code == 200
    led = _ledger(client)
    account = "Assets:Investments:TaxAdvantaged:PlanA"
    assert _open_entry(led, account).currencies == ["USD"]  # USD-constrained
    assert "Equity:Adjustments:Investments:PlanA" not in led.active_accounts()
    meta = led.account_meta()[account]
    assert meta["employer"] == "EmployerA"
    assert meta["labels"] == "OptionA,OptionB"


def test_add_nested_name_and_bad_segment(client: TestClient):
    assert (
        client.post(
            "/api/investment",
            json={"subtree": "TaxAdvantaged", "leaf": "GroupA:AcctB", "holds_shares": True},
        ).status_code
        == 200
    )
    assert "Assets:Investments:TaxAdvantaged:GroupA:AcctB" in _ledger(client).active_accounts()
    # lowercase-initial segment is a beancount parse error → rejected up front
    bad = client.post("/api/investment", json={"subtree": "Taxable", "leaf": "acctA"})
    assert bad.status_code == 422


# --- close ---


def test_close_share_account_values_and_splits(client: TestClient):
    _seed_shares(client)  # 10 shares @ 500 = 5000 USD
    r = client.post(
        "/api/investment/close",
        json={
            "account": BROKERAGE,
            "date": "2026-02-01",
            "legs": [
                {"destination": BANK_A, "amount": 3000.00},
                {"destination": BANK_B, "amount": 2000.00},
            ],
        },
    )
    assert r.status_code == 200
    assert r.json()["value"] == 5000.00
    led = _ledger(client)
    assert led.holdings(BROKERAGE) == {}
    assert BROKERAGE not in led.active_accounts()
    assert BROKERAGE_PLUG not in led.active_accounts()


def test_close_legs_must_sum_to_value(client: TestClient):
    _seed_shares(client)  # worth 5000
    r = client.post(
        "/api/investment/close",
        json={
            "account": BROKERAGE,
            "date": "2026-02-01",
            "legs": [{"destination": BANK_A, "amount": 4000.00}],
        },
    )
    assert r.status_code == 422
    assert "sum to" in r.json()["detail"]


def test_close_without_price_is_422(client: TestClient):
    _append_ledger(
        client,
        f"""
        2020-01-01 commodity {TICKER}
        2026-01-01 open {BROKERAGE}
        2020-01-01 open {BROKERAGE_PLUG}
        2026-01-05 * "buy"
          {BROKERAGE}  5 {TICKER} {{100.00 USD}}
          {BANK_A}  -500.00 USD
        """,
    )
    r = client.post(
        "/api/investment/close",
        json={
            "account": BROKERAGE,
            "date": "2026-02-01",
            "legs": [{"destination": BANK_A, "amount": 1.00}],
        },
    )
    assert r.status_code == 422
    assert "price" in r.json()["detail"]


def test_close_usd_plan_splits_without_plug(client: TestClient):
    # The API opens as of today, so fund/close on today or later.
    today = dt.date.today().isoformat()
    client.post(
        "/api/investment",
        json={"subtree": "TaxAdvantaged", "leaf": "PlanA", "holds_shares": False},
    )
    account = "Assets:Investments:TaxAdvantaged:PlanA"
    client.post(
        "/api/transfer",
        json={"date": today, "from_account": BANK_B, "to_account": account, "amount": 900.00},
    )
    r = client.post(
        "/api/investment/close",
        json={
            "account": account,
            "date": today,
            "legs": [{"destination": BANK_B, "amount": 900.00}],
        },
    )
    assert r.status_code == 200
    led = _ledger(client)
    assert account not in led.active_accounts()
    assert led.balance(account) == 0
