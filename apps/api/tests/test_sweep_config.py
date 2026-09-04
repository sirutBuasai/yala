"""Passthrough sweep configuration (sweep_to open-meta) and the drain-close retirement flow,
exercised through the API path."""

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

PASSTHROUGH = "Assets:Cash:Passthrough"
# Derived as production does, so the test cannot drift from the payee actually written.
SWEEP_PAYEE = sweep_payee(PASSTHROUGH)
SAVINGS = "Assets:Cash:Savings"
BANK_A = "Assets:Cash:BankA"
BANK_B = "Assets:Cash:BankB"


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    ledger_dir = tmp_path / "ledger"
    shutil.copytree(FIXTURE_LEDGER, ledger_dir)
    monkeypatch.setattr(config, "LEDGER_DIR", ledger_dir)
    monkeypatch.setattr(config, "MAIN_LEDGER", ledger_dir / "main.beancount")
    c = TestClient(app)
    c.ledger_dir = ledger_dir  # type: ignore[attr-defined]
    return c


def _balance(client: TestClient, account: str) -> Decimal:
    led = Ledger(client.ledger_dir / "main.beancount").load()  # type: ignore[attr-defined]
    return sum(
        (p.amount for t in led.transactions() for p in t.postings if p.account == account),
        Decimal(0),
    )


def _sweeps(client: TestClient, ym: str, payee: str) -> list[dict]:
    transfers = client.get("/api/data").json()["months"].get(ym, {}).get("transfers", [])
    return [t for t in transfers if t["payee"] == payee]


def _spend(client: TestClient, funding: str, date: str, amount: float):
    return client.post(
        "/api/transaction",
        json={
            "date": date,
            "payee": "spend",
            "amount": amount,
            "category": "Takeouts",
            "funding_account": funding,
        },
    )


# --- sweep_to configuration ---


def _set_sweep(client: TestClient, account: str, dest: str | None):
    return client.post("/api/account/sweep", json={"account": account, "dest": dest})


def test_declaring_a_passthrough_starts_sweeping_it(client: TestClient):
    assert _set_sweep(client, BANK_B, SAVINGS).status_code == 200
    _spend(client, BANK_B, "2026-02-10", 25.00)

    sweeps = _sweeps(client, "2026-02", "bankb sweep")
    assert len(sweeps) == 1
    # A net outflow from the passthrough pulls money in from its destination.
    assert (sweeps[0]["from_account"], sweeps[0]["to_account"]) == (SAVINGS, BANK_B)
    assert sweeps[0]["amount"] == 25.00


def test_clearing_a_passthrough_stops_sweeping(client: TestClient):
    assert _set_sweep(client, PASSTHROUGH, None).status_code == 200
    _spend(client, PASSTHROUGH, "2026-02-10", 30.00)

    assert _sweeps(client, "2026-02", SWEEP_PAYEE) == []


def test_transitive_reduction_collapses_intermediate_passthrough(client: TestClient):
    # BankB → passthrough → savings collapses: BankB sweeps directly to the terminal, savings.
    assert _set_sweep(client, BANK_B, PASSTHROUGH).status_code == 200
    _spend(client, BANK_B, "2026-02-10", 40.00)

    sweeps = _sweeps(client, "2026-02", "bankb sweep")
    assert len(sweeps) == 1
    assert {sweeps[0]["from_account"], sweeps[0]["to_account"]} == {BANK_B, SAVINGS}
    assert PASSTHROUGH not in (sweeps[0]["from_account"], sweeps[0]["to_account"])


def test_sweep_cycle_is_rejected(client: TestClient):
    # The passthrough already sweeps to savings; pointing savings back at it would cycle.
    r = client.post("/api/account/sweep", json={"account": SAVINGS, "dest": PASSTHROUGH})
    assert r.status_code == 422
    assert "cycle" in r.json()["detail"]


def test_sweep_to_self_is_rejected(client: TestClient):
    r = client.post("/api/account/sweep", json={"account": BANK_A, "dest": BANK_A})
    assert r.status_code == 422


def test_sweep_to_non_balance_sheet_account_is_rejected(client: TestClient):
    r = client.post("/api/account/sweep", json={"account": BANK_A, "dest": "Expenses:Takeouts"})
    assert r.status_code == 422


def test_sweep_to_unopened_account_is_rejected(client: TestClient):
    r = client.post("/api/account/sweep", json={"account": BANK_A, "dest": "Assets:Cash:Ghost"})
    assert r.status_code == 422


def test_setting_sweep_replaces_previous_destination(client: TestClient):
    # sweep_to is a single meta value, so an account can only sweep to one place — re-setting
    # replaces rather than accumulates.
    assert _set_sweep(client, BANK_A, SAVINGS).status_code == 200
    assert _set_sweep(client, BANK_A, BANK_B).status_code == 200
    assert client.get("/api/accounts").json()["sweeps"][BANK_A] == BANK_B


# --- drain-close ---


def test_drain_close_zeroes_and_closes_the_account(client: TestClient):
    # Give BankA a balance, then retire it into BankB (which carries its own fixture balance).
    bank_b_before = _balance(client, BANK_B)
    client.post(
        "/api/transfer",
        json={"date": "2026-02-01", "from_account": BANK_B, "to_account": BANK_A, "amount": 500.00},
    )
    assert _balance(client, BANK_A) == Decimal("500.00")

    r = client.post(
        "/api/account/drain-close",
        json={"account": BANK_A, "destination": BANK_B, "date": "2026-02-05"},
    )
    assert r.status_code == 200
    assert r.json()["drained"] == 500.00
    assert _balance(client, BANK_A) == 0
    assert _balance(client, BANK_B) == bank_b_before  # 500 out then 500 back nets to zero change
    assert BANK_A not in client.get("/api/accounts").json()["cash_accounts"]


def test_drain_close_with_zero_balance_just_closes(client: TestClient):
    r = client.post(
        "/api/account/drain-close",
        json={"account": BANK_A, "destination": BANK_B, "date": "2026-02-05"},
    )
    assert r.status_code == 200
    assert r.json()["drained"] == 0
    assert BANK_A not in client.get("/api/accounts").json()["cash_accounts"]


def test_drain_close_passthrough_retires_sweep_and_config(client: TestClient):
    # The passthrough is kept near-zero by its month-end sweep. Retiring it must delete that
    # sweep, strip sweep_to, drain the real balance, and close — leaving nothing dated after close.
    _spend(client, PASSTHROUGH, "2026-02-10", 30.00)
    assert _sweeps(client, "2026-02", SWEEP_PAYEE)  # auto-sweep exists

    r = client.post(
        "/api/account/drain-close",
        json={"account": PASSTHROUGH, "destination": SAVINGS, "date": "2026-02-15"},
    )
    assert r.status_code == 200

    acc = client.get("/api/accounts").json()
    assert PASSTHROUGH not in acc["cash_accounts"]  # closed
    assert PASSTHROUGH not in acc.get("sweeps", {})  # sweep_to stripped
    assert _sweeps(client, "2026-02", SWEEP_PAYEE) == []  # auto-sweep removed
    assert _balance(client, PASSTHROUGH) == 0  # zeroed by the final drain


def test_drain_close_same_account_is_rejected(client: TestClient):
    r = client.post("/api/account/drain-close", json={"account": BANK_A, "destination": BANK_A})
    assert r.status_code == 422


def test_failing_passthrough_is_isolated_and_surfaced(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    # Two passthroughs; one fails. The loop must still reconcile the other, then raise an
    # aggregated error naming the failure (rather than aborting on the first).
    import yala.ledger.sweep as sweep
    from yala.sink import FileLedgerSink

    ledger_dir = tmp_path / "ledger"
    shutil.copytree(FIXTURE_LEDGER, ledger_dir)
    sink = FileLedgerSink(ledger_dir)

    monkeypatch.setattr(
        sweep, "sweep_targets", lambda ledger: {PASSTHROUGH: SAVINGS, BANK_A: BANK_B}
    )
    seen: list[str] = []

    def fake_one(sink, ledger, active, source, terminal, year, month, date):
        seen.append(source)
        if source == PASSTHROUGH:
            raise ValueError("boom")

    monkeypatch.setattr(sweep, "_reconcile_one", fake_one)

    with pytest.raises(sweep.LedgerError) as ei:
        sweep.reconcile_month(sink, 2026, 2)

    assert set(seen) == {PASSTHROUGH, BANK_A}  # both attempted despite the first failing
    assert PASSTHROUGH in str(ei.value)
