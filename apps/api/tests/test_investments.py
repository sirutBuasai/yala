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


def _seed_shares(client: TestClient, price: str = "500.00") -> None:
    """Append a priced share holding (10 VOO, bought from BankA) to the per-test ledger copy."""
    path = client.ledger_dir / "accounts.beancount"  # type: ignore[attr-defined]
    path.write_text(
        path.read_text()
        + textwrap.dedent(f"""
        2020-01-01 commodity VOO
        2026-01-01 open {BROKERAGE}
        2020-01-01 open Equity:Adjustments:Investments:Brokerage
        2026-01-05 price VOO {price} USD
        2026-01-05 * "buy"
          {BROKERAGE}  10 VOO @ {price} USD
          {BANK_A}  -{Decimal(price) * 10} USD
        """)
    )


# --- add ---


def test_add_share_account_is_unconstrained_with_seed_and_plug(client: TestClient):
    r = client.post(
        "/api/account/investment",
        json={"subtree": "Taxable", "name": "Fidelity", "holds_shares": True},
    )
    assert r.status_code == 200
    led = _ledger(client)
    account = "Assets:Investments:Taxable:Fidelity"
    assert account in led.active_accounts()
    assert _open_entry(led, account).currencies is None  # unconstrained → holds any ticker
    assert "Equity:Adjustments:Investments:Fidelity" in led.active_accounts()
    assert any(
        isinstance(e, data.Balance) and e.account == account for e in led.entries
    )  # 0.00 USD genesis seed


def test_add_usd_only_plan_is_constrained_without_seed_or_plug(client: TestClient):
    r = client.post(
        "/api/account/investment",
        json={
            "subtree": "TaxAdvantaged",
            "name": "Plan401k",
            "holds_shares": False,
            "employer": "Amazon",
            "labels": ["Roth401k", "Trad401k"],
        },
    )
    assert r.status_code == 200
    led = _ledger(client)
    account = "Assets:Investments:TaxAdvantaged:Plan401k"
    assert _open_entry(led, account).currencies == ["USD"]  # USD-constrained
    assert "Equity:Adjustments:Investments:Plan401k" not in led.active_accounts()
    meta = led.account_meta()[account]
    assert meta["employer"] == "Amazon"
    assert meta["labels"] == "Roth401k,Trad401k"


def test_add_nested_name_and_bad_segment(client: TestClient):
    assert (
        client.post(
            "/api/account/investment",
            json={"subtree": "TaxAdvantaged", "name": "HSA:Fidelity", "holds_shares": True},
        ).status_code
        == 200
    )
    assert "Assets:Investments:TaxAdvantaged:HSA:Fidelity" in _ledger(client).active_accounts()
    # lowercase-initial segment is a beancount parse error → rejected up front
    bad = client.post("/api/account/investment", json={"subtree": "Taxable", "name": "fidelity"})
    assert bad.status_code == 422


# --- close ---


def test_close_share_account_values_and_splits(client: TestClient):
    _seed_shares(client)  # 10 VOO @ 500 = 5000 USD
    r = client.post(
        "/api/account/investment-close",
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
    assert led.holdings(BROKERAGE) == {}  # fully liquidated
    assert BROKERAGE not in led.active_accounts()
    assert "Equity:Adjustments:Investments:Brokerage" not in led.active_accounts()


def test_close_legs_must_sum_to_value(client: TestClient):
    _seed_shares(client)  # worth 5000
    r = client.post(
        "/api/account/investment-close",
        json={
            "account": BROKERAGE,
            "date": "2026-02-01",
            "legs": [{"destination": BANK_A, "amount": 4000.00}],
        },
    )
    assert r.status_code == 422
    assert "sum to" in r.json()["detail"]


def test_close_without_price_is_422(client: TestClient):
    path = client.ledger_dir / "accounts.beancount"  # type: ignore[attr-defined]
    path.write_text(
        path.read_text()
        + textwrap.dedent(f"""
        2020-01-01 commodity NOPX
        2026-01-01 open {BROKERAGE}
        2020-01-01 open Equity:Adjustments:Investments:Brokerage
        2026-01-05 * "buy"
          {BROKERAGE}  5 NOPX {{100.00 USD}}
          {BANK_A}  -500.00 USD
        """)
    )
    r = client.post(
        "/api/account/investment-close",
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
        "/api/account/investment",
        json={"subtree": "TaxAdvantaged", "name": "Plan401k", "holds_shares": False},
    )
    account = "Assets:Investments:TaxAdvantaged:Plan401k"
    client.post(
        "/api/transfer",
        json={"date": today, "from_account": BANK_B, "to_account": account, "amount": 900.00},
    )
    r = client.post(
        "/api/account/investment-close",
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
