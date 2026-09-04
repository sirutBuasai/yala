"""Auto-maintained passthrough sweep, exercised through the full reconcile-on-write API path."""

from __future__ import annotations

import shutil
from decimal import Decimal
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from yala import config
from yala.api import app
from yala.ledger import Ledger
from yala.ledger.sweep import sweep_payee

FIXTURE_LEDGER = Path(__file__).parent / "fixtures" / "ledger"

# The fixture ledger's sweep pair: a passthrough kept near-zero, draining to its destination.
PASSTHROUGH = "Assets:Cash:Passthrough"
PASSTHROUGH_DEST = "Assets:Cash:Savings"
# Derived exactly as production does, so the test cannot drift from the payee actually written.
SWEEP_PAYEE = sweep_payee(PASSTHROUGH)


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    ledger_dir = tmp_path / "ledger"
    shutil.copytree(FIXTURE_LEDGER, ledger_dir)
    monkeypatch.setattr(config, "LEDGER_DIR", ledger_dir)
    monkeypatch.setattr(config, "MAIN_LEDGER", ledger_dir / "main.beancount")
    c = TestClient(app)
    c.ledger_dir = ledger_dir  # type: ignore[attr-defined]
    return c


# --- helpers ---


def _sweeps(client: TestClient, ym: str) -> list[dict]:
    transfers = client.get("/api/data").json()["months"].get(ym, {}).get("transfers", [])
    return [t for t in transfers if t["payee"] == SWEEP_PAYEE]


def _passthrough_balance(client: TestClient) -> Decimal:
    led = Ledger(client.ledger_dir / "main.beancount").load()  # type: ignore[attr-defined]
    return sum(
        (p.amount for t in led.transactions() for p in t.postings if p.account == PASSTHROUGH),
        Decimal(0),
    )


def _spend_venmo(client: TestClient, date: str, amount: float, payee: str = "venmo pay"):
    return client.post(
        "/api/transaction",
        json={
            "date": date,
            "payee": payee,
            "amount": amount,
            "category": "Takeouts",
            "funding_account": PASSTHROUGH,
        },
    )


def _fund_passthrough(client: TestClient, date: str, amount: float):
    """Money into the passthrough (a bank → passthrough bill pay), i.e. net inflow."""
    return client.post(
        "/api/transfer",
        json={
            "date": date,
            "payee": "got paid back",
            "from_account": "Assets:Cash:BankA",
            "to_account": PASSTHROUGH,
            "amount": amount,
        },
    )


# --- tests ---


def test_no_venmo_activity_means_no_sweep(client: TestClient):
    client.post(
        "/api/transaction",
        json={
            "date": "2026-02-10",
            "payee": "cc coffee",
            "amount": 4.25,
            "category": "Takeouts",
            "funding_account": "Liabilities:CC:CardA",
        },
    )
    assert _sweeps(client, "2026-02") == []


def test_first_venmo_payment_creates_month_end_sweep(client: TestClient):
    _spend_venmo(client, "2026-02-10", 30.00)

    sweeps = _sweeps(client, "2026-02")
    assert len(sweeps) == 1
    s = sweeps[0]
    assert (s["from_account"], s["to_account"]) == (PASSTHROUGH_DEST, PASSTHROUGH)
    assert s["amount"] == 30.00
    assert s["date"] == "2026-02-28"  # dated the last day of the month
    assert _passthrough_balance(client) == 0


def test_further_payments_accumulate_into_one_entry(client: TestClient):
    _spend_venmo(client, "2026-02-10", 30.00)
    _spend_venmo(client, "2026-02-15", 20.00)

    sweeps = _sweeps(client, "2026-02")
    assert len(sweeps) == 1  # a single accumulating entry, not one per payment
    assert sweeps[0]["amount"] == 50.00
    assert sweeps[0]["from_account"] == PASSTHROUGH_DEST
    assert _passthrough_balance(client) == 0


def test_net_zero_removes_the_sweep(client: TestClient):
    _spend_venmo(client, "2026-02-10", 30.00)
    assert _sweeps(client, "2026-02")  # sweep exists after the outflow
    _fund_passthrough(client, "2026-02-12", 30.00)  # equal inflow nets the passthrough to zero

    assert _sweeps(client, "2026-02") == []
    assert _passthrough_balance(client) == 0


def test_net_inflow_reverses_the_sweep(client: TestClient):
    _spend_venmo(client, "2026-02-10", 20.00)
    _fund_passthrough(client, "2026-02-12", 50.00)  # net +30 into the passthrough

    sweeps = _sweeps(client, "2026-02")
    assert len(sweeps) == 1
    s = sweeps[0]
    assert (s["from_account"], s["to_account"]) == (PASSTHROUGH, PASSTHROUGH_DEST)  # drains back
    assert s["amount"] == 30.00
    assert _passthrough_balance(client) == 0


def test_editing_the_sweep_is_rejected(client: TestClient):
    _spend_venmo(client, "2026-02-10", 30.00)
    sweep = _sweeps(client, "2026-02")[0]

    upd = client.post(
        "/api/transfer/update",
        json={
            "locator": sweep["locator"],
            "from_account": PASSTHROUGH_DEST,
            "to_account": PASSTHROUGH,
            "amount": 999.00,  # a manual edit
        },
    )
    assert upd.status_code == 409
    assert "auto-managed" in upd.json()["detail"]

    after = _sweeps(client, "2026-02")
    assert len(after) == 1
    assert after[0]["amount"] == 30.00  # untouched
    assert _passthrough_balance(client) == 0


def test_deleting_the_sweep_directly_is_rejected(client: TestClient):
    _spend_venmo(client, "2026-02-10", 30.00)
    sweep = _sweeps(client, "2026-02")[0]

    d = client.post("/api/entry/delete", json={"locator": sweep["locator"]})
    assert d.status_code == 409
    assert "auto-managed" in d.json()["detail"]

    assert len(_sweeps(client, "2026-02")) == 1  # still there


def test_deleting_the_last_venmo_payment_removes_the_sweep(client: TestClient):
    add = _spend_venmo(client, "2026-02-10", 30.00)
    locator = f"id:{add.json()['id']}"
    assert _sweeps(client, "2026-02")

    client.post("/api/entry/delete", json={"locator": locator})

    assert _sweeps(client, "2026-02") == []
    assert _passthrough_balance(client) == 0


def test_unrelated_edit_in_month_does_not_duplicate_sweep(client: TestClient):
    _spend_venmo(client, "2026-02-10", 30.00)
    client.post(
        "/api/transaction",
        json={
            "date": "2026-02-11",
            "payee": "cc lunch",
            "amount": 12.00,
            "category": "Takeouts",
            "funding_account": "Liabilities:CC:CardA",
        },
    )

    sweeps = _sweeps(client, "2026-02")
    assert len(sweeps) == 1
    assert sweeps[0]["amount"] == 30.00


def test_sweeps_are_isolated_per_month(client: TestClient):
    _spend_venmo(client, "2026-02-10", 30.00)
    _spend_venmo(client, "2026-03-10", 20.00)

    assert _sweeps(client, "2026-02")[0]["amount"] == 30.00
    assert _sweeps(client, "2026-03")[0]["amount"] == 20.00


def test_venmo_credit_leg_on_expense_counts_as_inflow(client: TestClient):
    # A card-funded split bill with a friend's share paid back into the passthrough: a positive
    # credit
    # leg sharing an expense transaction. This pattern exists in the historical ledger, so the net
    # must fold it in like any other passthrough activity.
    client.post(
        "/api/transaction",
        json={
            "date": "2026-02-10",
            "payee": "utilities",
            "amount": 100.00,  # total bill
            "category": "Takeouts",
            "funding_account": "Liabilities:CC:CardA",
            # $30 reimbursed into the passthrough
            "credits": [{"account": PASSTHROUGH, "amount": 30.00}],
        },
    )

    sweeps = _sweeps(client, "2026-02")
    assert len(sweeps) == 1
    # +30 into the passthrough drains back to savings
    assert (sweeps[0]["from_account"], sweeps[0]["to_account"]) == (PASSTHROUGH, PASSTHROUGH_DEST)
    assert sweeps[0]["amount"] == 30.00
    assert _passthrough_balance(client) == 0


def test_bank_to_venmo_bill_pay_drains_via_sweep(client: TestClient):
    _fund_passthrough(client, "2026-02-12", 40.00)  # only activity: money into the passthrough

    sweeps = _sweeps(client, "2026-02")
    assert len(sweeps) == 1
    assert (sweeps[0]["from_account"], sweeps[0]["to_account"]) == (PASSTHROUGH, PASSTHROUGH_DEST)
    assert sweeps[0]["amount"] == 40.00
    assert _passthrough_balance(client) == 0
