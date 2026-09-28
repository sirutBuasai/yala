"""``/api/balances``: a whole sitting of readings saved in one request."""

from __future__ import annotations

import datetime as dt
import shutil
from decimal import Decimal
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from tests.conftest import BANK_A, BANK_B, CARD_A, WALLET, load_ledger
from yala.ledger import files
from yala.ledger.accounts import snapshot_plug
from yala.sink import FileLedgerSink

SEP = dt.date(2026, 9, 1)
READINGS = {BANK_A: Decimal("1000.00"), BANK_B: Decimal("250.00"), WALLET: Decimal("40.00")}


def _post(client: TestClient, readings: list[dict], date: dt.date = SEP):
    return client.post("/api/balances", json={"date": date.isoformat(), "readings": readings})


def _ledger_text(ledger_dir: Path) -> dict[str, str]:
    """Every file's text less its ids, which are random per write."""
    return {
        str(p.relative_to(ledger_dir)): "\n".join(
            line for line in p.read_text().splitlines() if "id:" not in line
        )
        for p in sorted(ledger_dir.rglob("*.beancount"))
    }


def test_a_sitting_writes_the_same_ledger_as_one_reading_at_a_time(ledger_dir: Path, tmp_path):
    """Batching is only about speed, so the files it leaves must match the one-by-one path."""
    single = tmp_path / "single"
    shutil.copytree(ledger_dir, single)
    for account, amount in READINGS.items():
        FileLedgerSink(single).log_balance(account, amount, SEP, snapshot_plug(account))

    ids, errors = FileLedgerSink(ledger_dir).log_balances(READINGS, SEP, snapshot_plug)

    assert errors == {} and set(ids) == set(READINGS)
    assert _ledger_text(ledger_dir) == _ledger_text(single)
    load_ledger(ledger_dir)


def test_endpoint_returns_a_locator_per_saved_account(client: TestClient):
    r = _post(client, [{"account": a, "amount": float(v)} for a, v in READINGS.items()])

    assert r.status_code == 200, r.text
    body = r.json()
    assert body["failed"] == {}
    standing = client.get(f"/api/networth?date={SEP.isoformat()}").json()["standing"]
    assert {a: standing[a]["locator"] for a in READINGS} == body["saved"]


def test_a_refused_reading_is_reported_and_the_rest_still_save(client: TestClient):
    r = _post(
        client,
        [{"account": BANK_A, "amount": 1000.0}, {"account": BANK_B, "amount": -5.0}],
    )

    assert r.status_code == 200, r.text
    body = r.json()
    assert list(body["saved"]) == [BANK_A]
    assert "negative" in body["failed"][BANK_B]


def test_a_reading_with_a_locator_corrects_the_standing_snapshot(client: TestClient):
    first = _post(client, [{"account": BANK_A, "amount": 1000.0}]).json()["saved"][BANK_A]

    r = _post(client, [{"account": BANK_A, "amount": 1200.0, "locator": first}])

    assert r.status_code == 200, r.text
    at = client.get(f"/api/networth?date={SEP.isoformat()}").json()
    assert {a["account"]: a["value"] for a in at["accounts"]}[BANK_A] == 1200.0
    assert at["standing"][BANK_A]["locator"] == first


def test_an_account_read_twice_in_one_sitting_is_refused(client: TestClient):
    r = _post(client, [{"account": BANK_A, "amount": 1.0}, {"account": BANK_A, "amount": 2.0}])
    assert r.status_code == 422


def test_a_failed_joint_write_falls_back_to_one_at_a_time(
    ledger_dir: Path, monkeypatch: pytest.MonkeyPatch
):
    """The joint reload can't say which reading broke it, so each is retried alone to learn."""
    real = files.load_checked
    calls = {"n": 0}

    def fail_first(*args, **kwargs):
        calls["n"] += 1
        if calls["n"] == 1:
            raise ValueError("joint reload failed")
        return real(*args, **kwargs)

    monkeypatch.setattr(files, "load_checked", fail_first)
    readings = {**READINGS, CARD_A: Decimal("76.70")}

    ids, errors = FileLedgerSink(ledger_dir).log_balances(readings, SEP, snapshot_plug)

    assert errors == {} and set(ids) == set(readings)
    standing = load_ledger(ledger_dir).net_worth.standing_at(SEP)
    assert {a: f"id:{i}" for a, i in ids.items()} == {a: standing[a].locator for a in readings}
