"""Net-worth domain, the ``log_balance`` sink write, and the ``/api/balance`` endpoint."""

from __future__ import annotations

import datetime as dt
import shutil
from decimal import Decimal
from pathlib import Path

import pytest
from beancount.core import data
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
        adjustment_account("Assets:Investments:TaxAdvantaged:HSA:Fidelity")
        == "Equity:Adjustments:Investments:HSA:Fidelity"
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


def test_log_balance_stamps_an_id_for_later_editing(ledger_dir: Path):
    account = "Assets:Cash:BankA"
    entry_id = FileLedgerSink(ledger_dir).log_balance(
        account, Decimal("1000.00"), SEP, adjustment_account(account)
    )

    assert f'id: "{entry_id}"' in (ledger_dir / "assets" / "2026.beancount").read_text()
    assert _load(ledger_dir).net_worth.logged_at(SEP)[account] == f"id:{entry_id}"


def test_log_balance_monthly_history_skips_unneeded_pads(ledger_dir: Path):
    """Logging month after month keeps every snapshot, changed or not.

    beancount rejects a pad it doesn't need ("Unused Pad entry"), so a pad is written only for the
    months where the balance moved — otherwise re-logging an unchanged figure would fail."""
    account = "Assets:Cash:BankA"
    plug = adjustment_account(account)
    sink = FileLedgerSink(ledger_dir)

    for date, amount in [
        (dt.date(2026, 9, 1), "1000.00"),
        (dt.date(2026, 10, 1), "1000.00"),  # unchanged — no pad
        (dt.date(2026, 11, 1), "1500.00"),  # moved — needs a pad
    ]:
        sink.log_balance(account, Decimal(amount), date, plug)

    led = _load(ledger_dir)  # strict load: an unused pad would raise here
    assert led.balance(account, dt.date(2026, 11, 1)) == Decimal("1500.00")

    def dates(kind) -> list[dt.date]:
        return sorted(e.date for e in led.entries if isinstance(e, kind) and e.account == account)

    # every logged month is asserted ...
    assert dates(data.Balance) == [dt.date(2026, 9, 1), dt.date(2026, 10, 1), dt.date(2026, 11, 1)]
    # ... but only the seeding month and the month that moved carry a pad
    assert dates(data.Pad) == [dt.date(2026, 8, 31), dt.date(2026, 10, 31)]


def _log_months(ledger_dir: Path, account: str, plan: list[tuple[dt.date, str]]) -> None:
    sink = FileLedgerSink(ledger_dir)
    for date, amount in plan:
        sink.log_balance(account, Decimal(amount), date, adjustment_account(account))


def test_update_balance_edits_the_located_assertion_in_place(ledger_dir: Path):
    """Editing a past month rewrites its own assertion rather than stacking a second one on it."""
    account = "Assets:Cash:BankA"
    _log_months(
        ledger_dir, account, [(dt.date(2026, 9, 1), "1000.00"), (dt.date(2026, 10, 1), "1000.00")]
    )

    led = _load(ledger_dir)
    locator = led.net_worth.logged_at(dt.date(2026, 9, 1))[account]
    FileLedgerSink(ledger_dir).update_balance(locator, Decimal("1250.00"))

    led = _load(ledger_dir)
    assert led.balance(account, dt.date(2026, 9, 1)) == Decimal("1250.00")
    # the later month keeps its own figure — the edit did not run away forward
    assert led.balance(account, dt.date(2026, 10, 1)) == Decimal("1000.00")
    dates = sorted(
        e.date for e in led.entries if isinstance(e, data.Balance) and e.account == account
    )
    assert dates == [dt.date(2026, 9, 1), dt.date(2026, 10, 1)]


def test_update_balance_adds_then_drops_pads_as_the_figure_requires(ledger_dir: Path):
    """A pad appears where a delta needs absorbing and goes away once it doesn't.

    Raising a figure needs a pad at its own date *and* at the next assertion that re-pins the
    account; setting it back leaves both unused, and beancount rejects an unused pad."""
    account = "Assets:Cash:BankA"
    plug = adjustment_account(account)
    _log_months(
        ledger_dir, account, [(dt.date(2026, 9, 1), "1000.00"), (dt.date(2026, 10, 1), "1000.00")]
    )
    sink = FileLedgerSink(ledger_dir)

    def pads() -> list[dt.date]:
        return sorted(
            e.date
            for e in _load(ledger_dir).entries
            if isinstance(e, data.Pad) and e.account == account
        )

    seeded = pads()  # the first month's own pad, which seeded the balance
    seeded_plug = _load(ledger_dir).balance(plug)

    locator = _load(ledger_dir).net_worth.logged_at(dt.date(2026, 9, 1))[account]
    sink.update_balance(locator, Decimal("1250.00"))
    assert pads() == sorted([*seeded, dt.date(2026, 9, 30)])  # re-pins October

    locator = _load(ledger_dir).net_worth.logged_at(dt.date(2026, 9, 1))[account]
    sink.update_balance(locator, Decimal("1000.00"))
    assert pads() == seeded  # the extra pad is gone again
    # and the round trip left no residue behind in the plug
    assert _load(ledger_dir).balance(plug) == seeded_plug


def test_update_balance_stamps_an_id_on_a_migrated_assertion(ledger_dir: Path):
    """Migrated assertions have only a source line to go by; editing one gives it a stable id.

    A line handle shifts whenever anything above it moves — including the pads an edit inserts — so
    the id is what makes a second edit of the same snapshot safe."""
    account = "Assets:Cash:BankA"
    sink = FileLedgerSink(ledger_dir)
    entry_id = sink.log_balance(account, Decimal("1000.00"), SEP, adjustment_account(account))

    # strip the id back off, leaving the bare directive a migrated snapshot has
    path = ledger_dir / "assets" / "2026.beancount"
    path.write_text(path.read_text().replace(f'  id: "{entry_id}"\n', ""))

    line_locator = _load(ledger_dir).net_worth.logged_at(SEP)[account]
    assert line_locator.startswith("line:")

    _, _, stable = sink.update_balance(line_locator, Decimal("1200.00"))
    assert stable.startswith("id:")

    # the id still resolves on a second edit, though the first one moved lines around
    _, _, again = sink.update_balance(stable, Decimal("1300.00"))
    assert again == stable
    assert _load(ledger_dir).balance(account, SEP) == Decimal("1300.00")


def test_balances_can_be_logged_several_times_in_one_month(ledger_dir: Path):
    """Snapshots are addressed by id, not by month, so a month may hold as many as you log."""
    account = "Assets:Cash:BankA"
    plug = adjustment_account(account)
    sink = FileLedgerSink(ledger_dir)

    ids = {
        day: sink.log_balance(account, Decimal(amount), dt.date(2026, 11, day), plug)
        for day, amount in [(5, "1000.00"), (12, "1100.00"), (26, "1075.00")]
    }

    led = _load(ledger_dir)
    assert [p.date for p in led.net_worth.series() if p.date.startswith("2026-11")] == [
        "2026-11-05",
        "2026-11-12",
        "2026-11-26",
    ]

    # editing the middle snapshot leaves the ones either side of it alone
    sink.update_balance(f"id:{ids[12]}", Decimal("1150.00"))
    led = _load(ledger_dir)
    assert led.balance(account, dt.date(2026, 11, 5)) == Decimal("1000.00")
    assert led.balance(account, dt.date(2026, 11, 12)) == Decimal("1150.00")
    assert led.balance(account, dt.date(2026, 11, 26)) == Decimal("1075.00")


def test_update_balance_rejects_a_stale_locator(ledger_dir: Path):
    _log_months(ledger_dir, "Assets:Cash:BankA", [(dt.date(2026, 9, 1), "1000.00")])
    with pytest.raises(KeyError):
        FileLedgerSink(ledger_dir).update_balance(
            "line:assets/2026.beancount:99999", Decimal("5.00")
        )


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
    assert [p.date for p in series] == ["2026-09-01"]
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


def test_patch_balance_edits_the_locator_from_networth_at(client: TestClient):
    """The pane's round trip: read a month's locator, update it, see the new figure."""
    account = "Assets:Cash:BankA"
    assert (
        client.post(
            "/api/balance", json={"account": account, "amount": 1000.0, "date": "2026-09-01"}
        ).status_code
        == 200
    )

    at = client.get("/api/networth?date=2026-09-01").json()
    locator = at["logged"][account]

    r = client.post("/api/balance/update", json={"locator": locator, "amount": 1234.56})
    assert r.status_code == 200, r.text
    assert r.json()["date"] == "2026-09-01"

    after = client.get("/api/networth?date=2026-09-01").json()
    assert dict((a["account"], a["value"]) for a in after["accounts"])[account] == 1234.56


def test_patch_balance_rejects_an_unknown_locator(client: TestClient):
    r = client.post(
        "/api/balance/update", json={"locator": "line:assets/2026.beancount:99999", "amount": 10.0}
    )
    assert r.status_code == 404


def test_balance_accounts_listed_in_accounts(client: TestClient):
    body = client.get("/api/accounts").json()
    assert "Assets:Cash:BankA" in body["balance_accounts"]


# --- liability balances: verify-only, no plug ---

CARD = "Liabilities:CC:CardA"
CARD_OWED = 83.20  # what the fixture ledger's spending leaves standing on 2026-09-01


def test_loggable_liabilities_lists_active_cards(ledger_dir: Path):
    loggable = _load(ledger_dir).net_worth.loggable_liabilities()
    assert CARD in loggable
    # CardD was closed in 2024
    assert "Liabilities:CC:CardD" not in loggable


def test_liability_accounts_listed_in_accounts(client: TestClient):
    assert CARD in client.get("/api/accounts").json()["liability_accounts"]


def test_post_liability_balance_stores_the_owed_figure_negative(client: TestClient):
    """Owed goes in positive, the way a bank app shows it, and lands negative in the ledger."""
    r = client.post(
        "/api/balance", json={"account": CARD, "amount": CARD_OWED, "date": "2026-09-01"}
    )
    assert r.status_code == 200, r.text

    at = client.get("/api/networth?date=2026-09-01").json()
    assert dict((a["account"], a["value"]) for a in at["accounts"])[CARD] == -CARD_OWED
    assert CARD in at["logged"]


def test_post_liability_balance_writes_no_pad(client: TestClient):
    """A card has no adjustment plug, so a snapshot must never pad — only assert."""
    assert (
        client.post(
            "/api/balance", json={"account": CARD, "amount": CARD_OWED, "date": "2026-09-01"}
        ).status_code
        == 200
    )
    text = "".join(p.read_text() for p in (config.LEDGER_DIR / "liabilities").glob("*.beancount"))
    assert f"balance {CARD}" in text
    assert "pad" not in text


def test_post_liability_balance_rejects_a_mismatch(client: TestClient):
    """A figure that disagrees means an entry is missing; it is reported, not padded away."""
    r = client.post("/api/balance", json={"account": CARD, "amount": 500.0, "date": "2026-09-01"})
    assert r.status_code == 422, r.text
    assert "spending or bill pay" in r.json()["detail"]

    # nothing was written
    assert CARD not in client.get("/api/networth?date=2026-09-01").json()["logged"]


def test_patch_liability_balance_keeps_the_owed_sign(client: TestClient):
    assert (
        client.post(
            "/api/balance", json={"account": CARD, "amount": CARD_OWED, "date": "2026-09-01"}
        ).status_code
        == 200
    )
    locator = client.get("/api/networth?date=2026-09-01").json()["logged"][CARD]

    # editing to a figure that no longer holds is refused, leaving the original in place
    edit = client.post("/api/balance/update", json={"locator": locator, "amount": 999.0})
    assert edit.status_code >= 400
    at = client.get("/api/networth?date=2026-09-01").json()
    assert dict((a["account"], a["value"]) for a in at["accounts"])[CARD] == -CARD_OWED
