"""Opening and closing investment accounts through the shared account routes: the unconstrained
open, the genesis seed and paired plug, the metadata, and the split-drain retirement."""

from __future__ import annotations

import datetime as dt
from decimal import Decimal

from beancount.core import data
from fastapi.testclient import TestClient

from tests.conftest import append_accounts, load_ledger
from yala.ledger import Ledger

BANK_A = "Assets:Cash:BankA"
BANK_B = "Assets:Cash:BankB"
BROKERAGE = "Assets:Investments:Taxable:Brokerage"
BROKERAGE_PLUG = "Equity:Adjustments:Investments:Taxable:Brokerage"
TICKER = "TICKA"


def _ledger(client: TestClient) -> Ledger:
    return load_ledger(client.ledger_dir)  # type: ignore[attr-defined]


def _open_entry(led: Ledger, account: str) -> data.Open:
    return next(e for e in led.entries if isinstance(e, data.Open) and e.account == account)


def _seed_shares(client: TestClient, price: str = "500.00") -> None:
    """Give BROKERAGE a priced share holding (10 shares, bought from BANK_A)."""
    append_accounts(
        client.ledger_dir,  # type: ignore[attr-defined]
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


def test_add_investment_is_unconstrained_with_seed_and_plug(client: TestClient):
    """One kind of investment account, opened unconstrained, so the same account can be snapshotted
    in dollars some months and in share quantities others."""
    r = client.post("/api/account", json={"kind": "investment", "tier": "Taxable", "name": "AcctA"})
    assert r.status_code == 200
    led = _ledger(client)
    account = "Assets:Investments:Taxable:AcctA"
    assert account in led.active_accounts()
    assert _open_entry(led, account).currencies is None  # unconstrained
    assert "Equity:Adjustments:Investments:Taxable:AcctA" in led.active_accounts()
    assert any(isinstance(e, data.Balance) and e.account == account for e in led.entries)


def test_add_investment_keeps_its_payroll_metadata(client: TestClient):
    r = client.post(
        "/api/account",
        json={
            "kind": "investment",
            "tier": "TaxAdvantaged",
            "name": "PlanA",
            "employer": "Employer1",
            "labels": ["OptionA", "OptionB"],
        },
    )
    assert r.status_code == 200
    led = _ledger(client)
    meta = led.account_meta()["Assets:Investments:TaxAdvantaged:PlanA"]
    assert meta["employer"] == "Employer1"
    assert meta["labels"] == "OptionA,OptionB"


def test_plug_and_account_share_an_open_date(client: TestClient):
    """A snapshot pads the day before the date it asserts, so a plug opened after the account it
    serves could not absorb the first one."""
    r = client.post(
        "/api/account",
        json={"kind": "investment", "tier": "Taxable", "name": "AcctB", "date": "2026-03-01"},
    )
    assert r.status_code == 200
    led = _ledger(client)
    account = "Assets:Investments:Taxable:AcctB"
    assert _open_entry(led, account).date == dt.date(2026, 3, 1)
    assert _open_entry(led, "Equity:Adjustments:Investments:Taxable:AcctB").date == dt.date(
        2026, 3, 1
    )


def test_a_name_composes_to_one_segment(client: TestClient):
    """An account's name is a single path segment. The tax tier is the only segment above it, so a
    typed colon has nothing to nest under and is refused rather than silently dropped."""
    r = client.post(
        "/api/account",
        json={"kind": "investment", "tier": "TaxAdvantaged", "name": "group a:acct b"},
    )

    assert r.status_code == 422
    assert "letters, numbers and spaces" in r.json()["detail"]


def test_a_spaced_lowercase_name_still_lands_as_a_legal_account(client: TestClient):
    r = client.post(
        "/api/account",
        json={"kind": "investment", "tier": "TaxAdvantaged", "name": "group a acct b"},
    )

    assert r.status_code == 200, r.text
    assert r.json()["account"] == "Assets:Investments:TaxAdvantaged:GroupAAcctB"
    assert "Assets:Investments:TaxAdvantaged:GroupAAcctB" in _ledger(client).active_accounts()


# --- close ---


def test_close_share_account_values_and_splits(client: TestClient):
    _seed_shares(client)  # 10 shares @ 500 = 5000 USD
    r = client.post(
        "/api/account/close",
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
    assert r.json()["moved"] == 5000.00
    led = _ledger(client)
    assert led.holdings(BROKERAGE) == {}
    assert BROKERAGE not in led.active_accounts()
    assert BROKERAGE_PLUG not in led.active_accounts()


def test_close_legs_must_sum_to_value(client: TestClient):
    _seed_shares(client)  # worth 5000
    r = client.post(
        "/api/account/close",
        json={
            "account": BROKERAGE,
            "date": "2026-02-01",
            "legs": [{"destination": BANK_A, "amount": 4000.00}],
        },
    )
    assert r.status_code == 422
    assert "sum to" in r.json()["detail"]


def test_close_without_price_is_422(client: TestClient):
    append_accounts(
        client.ledger_dir,  # type: ignore[attr-defined]
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
        "/api/account/close",
        json={
            "account": BROKERAGE,
            "date": "2026-02-01",
            "legs": [{"destination": BANK_A, "amount": 1.00}],
        },
    )
    assert r.status_code == 422
    assert "price" in r.json()["detail"]


def test_close_dollar_only_investment_splits_and_closes_its_plug(client: TestClient):
    # The account is opened as of today by default, so fund and close it on today or later.
    today = dt.date.today().isoformat()
    client.post(
        "/api/account", json={"kind": "investment", "tier": "TaxAdvantaged", "name": "PlanA"}
    )
    account = "Assets:Investments:TaxAdvantaged:PlanA"
    client.post(
        "/api/transfer",
        json={"date": today, "from_account": BANK_B, "to_account": account, "amount": 900.00},
    )
    r = client.post(
        "/api/account/close",
        json={
            "account": account,
            "date": today,
            "legs": [{"destination": BANK_B, "amount": 900.00}],
        },
    )
    assert r.status_code == 200
    led = _ledger(client)
    assert account not in led.active_accounts()
    assert "Equity:Adjustments:Investments:TaxAdvantaged:PlanA" not in led.active_accounts()
    assert led.balance(account) == 0


def test_value_endpoint_reads_a_past_date(client: TestClient):
    """A retirement's legs must sum to the value on the day it is dated, so the form has to be able
    to ask for that day's figure rather than today's."""
    _seed_shares(client)  # 10 shares @ 500 from 2026-01-05

    before = client.get(
        "/api/investment/value", params={"account": BROKERAGE, "date": "2026-01-04"}
    )
    after = client.get("/api/investment/value", params={"account": BROKERAGE, "date": "2026-01-06"})

    assert before.json()["value"] == 0.0
    assert after.json()["value"] == 5000.0


def test_value_endpoint_rejects_a_malformed_date(client: TestClient):
    r = client.get("/api/investment/value", params={"account": BROKERAGE, "date": "2026-13-40"})

    assert r.status_code == 422
