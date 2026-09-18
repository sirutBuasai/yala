"""Net-worth domain, the ``log_balance`` sink write, and the ``/api/balance`` endpoint."""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from pathlib import Path

import pytest
from beancount.core import data
from fastapi.testclient import TestClient

from tests.conftest import append_accounts
from tests.conftest import load_ledger as _load
from yala.ledger import Ledger
from yala.ledger.accounts import plug_account
from yala.sink import FileLedgerSink

SEP = dt.date(2026, 9, 1)


# --- plug_account mapping (pure) ---


def test_plug_account_keeps_the_tax_tier():
    """One plug per account. Two accounts differing only by tier are different accounts, so a plug
    that dropped the tier would be shared and could not say which account it served."""
    assert plug_account("Assets:Cash:BankA") == "Equity:Adjustments:BankA"
    assert (
        plug_account("Assets:Investments:Taxable:BrokerA")
        == "Equity:Adjustments:Investments:Taxable:BrokerA"
    )
    assert (
        plug_account("Assets:Investments:TaxAdvantaged:BrokerA")
        == "Equity:Adjustments:Investments:TaxAdvantaged:BrokerA"
    )
    # a colon-nested account keeps its full path below the tax tier
    assert (
        plug_account("Assets:Investments:TaxAdvantaged:BrokerBHSA")
        == "Equity:Adjustments:Investments:TaxAdvantaged:BrokerBHSA"
    )


def test_plug_account_is_none_where_there_is_no_plug():
    """A liability is verify-only and a category holds nothing, so neither has a plug."""
    assert plug_account("Liabilities:CC:CardA") is None
    assert plug_account("Expenses:Grocery") is None


# --- log_balance: USD account (no conversion) ---


def test_log_balance_usd_account_pads_to_asserted_value(ledger_dir: Path):
    account = "Assets:Cash:BankA"
    FileLedgerSink(ledger_dir).log_balance(account, Decimal("1000.00"), SEP, plug_account(account))

    led = _load(ledger_dir)
    assert led.balance(account, SEP) == Decimal("1000.00")
    # the untracked delta lands in the account's own plug
    assert led.balance("Equity:Adjustments:BankA", SEP) != 0

    text = (ledger_dir / "assets" / "2026.beancount").read_text()
    assert "2026-08-31 pad Assets:Cash:BankA Equity:Adjustments:BankA" in text
    assert "2026-09-01 balance Assets:Cash:BankA" in text


def test_log_balance_stamps_an_id_for_later_editing(ledger_dir: Path):
    account = "Assets:Cash:BankA"
    entry_id = FileLedgerSink(ledger_dir).log_balance(
        account, Decimal("1000.00"), SEP, plug_account(account)
    )

    assert f'id: "{entry_id}"' in (ledger_dir / "assets" / "2026.beancount").read_text()
    assert _load(ledger_dir).net_worth.logged_in_month(SEP)[account].locator == f"id:{entry_id}"


def test_logged_in_month_reports_the_asserted_figure(ledger_dir: Path):
    """The pane ghosts a logged month's own figure, so it reads the assertion rather than the
    account's value at that date, which would fold in anything posted on the day itself."""
    account = "Assets:Cash:BankA"
    FileLedgerSink(ledger_dir).log_balance(account, Decimal("1234.56"), SEP, plug_account(account))

    assert _load(ledger_dir).net_worth.logged_in_month(SEP)[account].amount == Decimal("1234.56")


def test_logged_in_month_reports_a_zero_balance(ledger_dir: Path):
    """Zero is a figure, not a blank: an account swept empty was logged and must count as logged."""
    account = "Assets:Cash:BankA"
    FileLedgerSink(ledger_dir).log_balance(account, Decimal("0.00"), SEP, plug_account(account))

    assert _load(ledger_dir).net_worth.logged_in_month(SEP)[account].amount == Decimal("0.00")


def test_logged_in_month_omits_a_month_with_no_assertion(ledger_dir: Path):
    account = "Assets:Cash:BankA"
    FileLedgerSink(ledger_dir).log_balance(account, Decimal("1000.00"), SEP, plug_account(account))

    assert account not in _load(ledger_dir).net_worth.logged_in_month(dt.date(2026, 10, 1))


def test_logged_in_month_finds_a_snapshot_on_any_day_of_it(ledger_dir: Path):
    """A snapshot need not land on the first: the month is what is asked for, not the date."""
    account = "Assets:Cash:BankA"
    late = dt.date(2026, 9, 26)
    FileLedgerSink(ledger_dir).log_balance(account, Decimal("777.00"), late, plug_account(account))

    found = _load(ledger_dir).net_worth.logged_in_month(SEP)[account]
    assert (found.date, found.amount) == (late, Decimal("777.00"))


def test_logged_in_month_takes_each_accounts_own_latest_snapshot(ledger_dir: Path):
    """Two snapshots in one month, covering different accounts: each account reports the later of
    its own, not the later of the month's."""
    bank = "Assets:Cash:BankA"
    other = "Assets:Cash:BankB"
    late = dt.date(2026, 9, 26)
    sink = FileLedgerSink(ledger_dir)
    sink.log_balance(bank, Decimal("100.00"), SEP, plug_account(bank))
    sink.log_balance(other, Decimal("200.00"), late, plug_account(other))

    logged = _load(ledger_dir).net_worth.logged_in_month(SEP)
    assert (logged[bank].date, logged[bank].amount) == (SEP, Decimal("100.00"))
    assert (logged[other].date, logged[other].amount) == (late, Decimal("200.00"))


def test_logged_in_month_values_a_share_snapshot_at_its_own_prices(ledger_dir: Path):
    """A share-based snapshot is worth its legs summed at that date's prices, and is not a balance
    this pane can rewrite, so it offers no locator."""
    account = "Assets:Investments:Taxable:BrokerA"
    append_accounts(
        ledger_dir,
        f"""
        2020-01-01 commodity TICKA
        2020-01-01 commodity TICKB
        2026-01-01 open {account}
        2026-09-26 price TICKA 10.00 USD
        2026-09-26 price TICKB 4.00 USD
        2026-01-05 * "buy"
          {account}  3 TICKA @ 10.00 USD
          {account}  5 TICKB @ 4.00 USD
          Assets:Cash:BankA  -50.00 USD
        2026-09-26 balance {account}  3 TICKA
        2026-09-26 balance {account}  5 TICKB
        """,
    )

    found = _load(ledger_dir).net_worth.logged_in_month(SEP)[account]
    assert found.amount == Decimal("50.00")  # 3 x 10 + 5 x 4
    assert found.locator is None  # the lots are the balance; there is no figure to rewrite


def test_logged_in_month_never_reaches_back_past_the_snapshot_it_shows(ledger_dir: Path):
    """A month can assert USD early and shares later. Offering the earlier USD assertion as the
    handle would rewrite a date the displayed figure never came from, restating that date and
    plugging the difference."""
    account = "Assets:Investments:Taxable:BrokerA"
    append_accounts(
        ledger_dir,
        f"""
        2020-01-01 commodity TICKA
        2026-01-01 open {account}
        2020-01-01 open {plug_account(account)}
        2026-09-26 price TICKA 10.00 USD
        """,
    )
    FileLedgerSink(ledger_dir).log_balance(account, Decimal("500.00"), SEP, plug_account(account))
    append_accounts(
        ledger_dir,
        f"""
        2026-09-20 * "buy"
          {account}  3 TICKA @ 10.00 USD
          Assets:Cash:BankA  -30.00 USD
        2026-09-26 balance {account}  500.00 USD
        2026-09-26 balance {account}  3 TICKA
        """,
    )

    found = _load(ledger_dir).net_worth.logged_in_month(SEP)[account]
    assert found.date == dt.date(2026, 9, 26)
    assert found.amount == Decimal("530.00")  # the USD leg plus 3 x 10
    assert found.locator is None  # NOT the lone USD assertion back on the 1st


def test_logged_in_month_rewrites_a_lone_usd_snapshot_in_place(ledger_dir: Path):
    """The ordinary case: one USD snapshot, corrected on its own line."""
    account = "Assets:Cash:BankA"
    entry_id = FileLedgerSink(ledger_dir).log_balance(
        account, Decimal("1000.00"), SEP, plug_account(account)
    )

    assert _load(ledger_dir).net_worth.logged_in_month(SEP)[account].locator == f"id:{entry_id}"


def test_log_balance_zero_pads_when_it_empties_an_account(ledger_dir: Path):
    """Zero is a figure to log, not a blank to skip. Emptying an account is a change, so it takes a
    pad like any other."""
    account = "Assets:Cash:BankA"
    plug = plug_account(account)
    sink = FileLedgerSink(ledger_dir)
    sink.log_balance(account, Decimal("1000.00"), dt.date(2026, 9, 1), plug)

    sink.log_balance(account, Decimal("0.00"), dt.date(2026, 10, 1), plug)

    led = _load(ledger_dir)
    assert led.balance(account, dt.date(2026, 10, 1)) == Decimal("0.00")
    pads = sorted(e.date for e in led.entries if isinstance(e, data.Pad) and e.account == account)
    assert dt.date(2026, 9, 30) in pads  # the day before, absorbing the drop to zero


def test_log_balance_zero_writes_no_pad_when_already_zero(ledger_dir: Path):
    """An unchanged zero still gets its assertion, but no pad: beancount rejects one it does not
    need, so emitting it unconditionally would make an unchanged balance impossible to log."""
    account = "Assets:Cash:BankA"
    plug = plug_account(account)
    sink = FileLedgerSink(ledger_dir)
    sink.log_balance(account, Decimal("0.00"), dt.date(2026, 9, 1), plug)

    sink.log_balance(account, Decimal("0.00"), dt.date(2026, 10, 1), plug)

    led = _load(ledger_dir)  # strict: an unused pad raises here
    asserted = sorted(
        e.date for e in led.entries if isinstance(e, data.Balance) and e.account == account
    )
    assert dt.date(2026, 10, 1) in asserted  # the assertion is still written
    assert dt.date(2026, 9, 30) not in [
        e.date for e in led.entries if isinstance(e, data.Pad) and e.account == account
    ]


def test_a_share_month_does_not_block_the_next_month(ledger_dir: Path):
    """A share snapshot refuses correction in its OWN month only. The month after has nothing logged
    yet, so it stays loggable in USD: the pad reclassifies the lots and the assertion stands."""
    account = "Assets:Investments:Taxable:BrokerA"
    plug = plug_account(account)
    append_accounts(
        ledger_dir,
        f"""
        2020-01-01 commodity TICKA
        2026-01-01 open {account}
        2020-01-01 open {plug}
        2026-01-05 price TICKA 10.00 USD
        2026-08-26 price TICKA 10.00 USD
        2026-01-06 * "buy"
          {account}  3 TICKA @ 10.00 USD
          Assets:Cash:BankA  -30.00 USD
        2026-08-26 balance {account}  3 TICKA
        """,
    )
    august = _load(ledger_dir).net_worth.logged_in_month(dt.date(2026, 8, 1))[account]
    assert august.locator is None  # August itself refuses
    assert account not in _load(ledger_dir).net_worth.logged_in_month(SEP)

    FileLedgerSink(ledger_dir).log_balance(account, Decimal("35.00"), SEP, plug)

    led = _load(ledger_dir)
    assert led.net_worth.logged_in_month(SEP)[account].amount == Decimal("35.00")
    # August's own snapshot is untouched, and only the real difference plugged
    assert led.net_worth.logged_in_month(dt.date(2026, 8, 1))[account].amount == Decimal("30.00")
    assert led.balance(plug) == Decimal("-5.00")


def test_log_balance_monthly_history_skips_unneeded_pads(ledger_dir: Path):
    """Logging month after month keeps every snapshot, changed or not.

    beancount rejects a pad it doesn't need, so one is written only for the months that moved."""
    account = "Assets:Cash:BankA"
    plug = plug_account(account)
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
        sink.log_balance(account, Decimal(amount), date, plug_account(account))


def test_update_balance_edits_the_located_assertion_in_place(ledger_dir: Path):
    """Editing a past month rewrites its own assertion rather than stacking a second one on it."""
    account = "Assets:Cash:BankA"
    _log_months(
        ledger_dir, account, [(dt.date(2026, 9, 1), "1000.00"), (dt.date(2026, 10, 1), "1000.00")]
    )

    led = _load(ledger_dir)
    locator = led.net_worth.logged_in_month(dt.date(2026, 9, 1))[account].locator
    FileLedgerSink(ledger_dir).update_balance(locator, Decimal("1250.00"))

    led = _load(ledger_dir)
    assert led.balance(account, dt.date(2026, 9, 1)) == Decimal("1250.00")
    # the later month keeps its own figure: the edit did not run forward
    assert led.balance(account, dt.date(2026, 10, 1)) == Decimal("1000.00")
    dates = sorted(
        e.date for e in led.entries if isinstance(e, data.Balance) and e.account == account
    )
    assert dates == [dt.date(2026, 9, 1), dt.date(2026, 10, 1)]


def test_update_balance_adds_then_drops_pads_as_the_figure_requires(ledger_dir: Path):
    """A pad appears where a delta needs absorbing and goes away once it doesn't.

    Raising a figure needs a pad at its own date *and* at the next assertion that re-pins the
    account; setting it back leaves both unused, which beancount rejects."""
    account = "Assets:Cash:BankA"
    plug = plug_account(account)
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

    locator = _load(ledger_dir).net_worth.logged_in_month(dt.date(2026, 9, 1))[account].locator
    sink.update_balance(locator, Decimal("1250.00"))
    assert pads() == sorted([*seeded, dt.date(2026, 9, 30)])  # re-pins October

    locator = _load(ledger_dir).net_worth.logged_in_month(dt.date(2026, 9, 1))[account].locator
    sink.update_balance(locator, Decimal("1000.00"))
    assert pads() == seeded  # the extra pad is gone again
    # the round trip left no residue in the plug
    assert _load(ledger_dir).balance(plug) == seeded_plug


def test_update_balance_stamps_an_id_on_a_migrated_assertion(ledger_dir: Path):
    """An assertion with no id has only a source line to go by, and that line shifts whenever
    anything above it moves — including the pads an edit inserts. Editing one stamps an id, which is
    what makes a second edit of the same snapshot safe."""
    account = "Assets:Cash:BankA"
    sink = FileLedgerSink(ledger_dir)
    entry_id = sink.log_balance(account, Decimal("1000.00"), SEP, plug_account(account))

    # strip the id back off, leaving a bare directive
    path = ledger_dir / "assets" / "2026.beancount"
    path.write_text(path.read_text().replace(f'  id: "{entry_id}"\n', ""))

    line_locator = _load(ledger_dir).net_worth.logged_in_month(SEP)[account].locator
    assert line_locator.startswith("line:")

    _, _, stable = sink.update_balance(line_locator, Decimal("1200.00"))
    assert stable.startswith("id:")

    # the id still resolves on a second edit, though the first moved lines around
    _, _, again = sink.update_balance(stable, Decimal("1300.00"))
    assert again == stable
    assert _load(ledger_dir).balance(account, SEP) == Decimal("1300.00")


def test_balances_can_be_logged_several_times_in_one_month(ledger_dir: Path):
    """Snapshots are addressed by id, not by month, so a month may hold as many as you log."""
    account = "Assets:Cash:BankA"
    plug = plug_account(account)
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
        "2020-01-01 commodity TICKA\n"
        "2020-01-01 open Assets:Investments:Taxable:Brokerage\n"
        "2020-01-01 open Equity:Opening-Balances\n"
        "2020-01-01 open Equity:Adjustments:Investments:Taxable:Brokerage\n"
        "2026-08-19 pad Assets:Investments:Taxable:Brokerage Equity:Opening-Balances\n"
        "2026-08-20 balance Assets:Investments:Taxable:Brokerage  10 TICKA\n"
        "2026-08-20 price TICKA 500.00 USD\n"
    )
    return root


def test_log_balance_reclassifies_shares_to_usd(tmp_path: Path):
    root = _write_share_ledger(tmp_path / "shares")
    account = "Assets:Investments:Taxable:Brokerage"

    # 10 TICKA @ 500 = 5000 market; log a 5200 USD total.
    FileLedgerSink(root).log_balance(account, Decimal("5200.00"), SEP, plug_account(account))

    led = Ledger(root / "main.beancount", strict=True).load()
    assert led.errors == []
    # the shares are gone, so nothing double-counts
    assert led.holdings(account, SEP) == {"USD": Decimal("5200.00")}
    assert led.value(account, SEP) == Decimal("5200.00")
    # only the untracked delta reached the plug, not the whole share value
    assert led.balance("Equity:Adjustments:Investments:Taxable:Brokerage", SEP) == Decimal(
        "-200.00"
    )


# --- NetWorth domain ---


def test_networth_series_and_adjustments(ledger_dir: Path):
    sink = FileLedgerSink(ledger_dir)
    sink.log_balance("Assets:Cash:BankA", Decimal("1000.00"), SEP, "Equity:Adjustments:BankA")
    sink.log_balance(
        "Assets:Investments:TaxAdvantaged:Employer401k",
        Decimal("2000.00"),
        SEP,
        "Equity:Adjustments:Investments:TaxAdvantaged:Employer401k",
    )

    nw = _load(ledger_dir).net_worth
    series = nw.series()
    assert [p.date for p in series] == ["2026-09-01"]
    point = series[0]
    assert point.net_worth == point.assets - point.liabilities

    labels = {a.label for a in nw.adjustments() if a.value != 0}
    assert {"BankA", "Investments:TaxAdvantaged:Employer401k"} <= labels


def test_loggable_accounts_excludes_swept(ledger_dir: Path):
    """Stated, not inferred from a plug's absence: every cash and investment account is opened with
    a plug, so what excludes a passthrough is its `sweep_to`, not a missing one."""
    loggable = _load(ledger_dir).net_worth.loggable_accounts()
    assert "Assets:Cash:BankA" in loggable
    assert "Assets:Cash:Passthrough" not in loggable


# --- /api/balance endpoint ---


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
    locator = at["logged"][account]["locator"]

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
    assert at["logged"][CARD]["amount"] == -CARD_OWED


def test_post_liability_balance_writes_no_pad(client: TestClient):
    """A card has no adjustment plug, so a snapshot must never pad — only assert."""
    assert (
        client.post(
            "/api/balance", json={"account": CARD, "amount": CARD_OWED, "date": "2026-09-01"}
        ).status_code
        == 200
    )
    root = client.ledger_dir / "liabilities"  # type: ignore[attr-defined]
    text = "".join(p.read_text() for p in root.glob("*.beancount"))
    assert f"balance {CARD}" in text
    assert "pad" not in text


def test_post_liability_balance_rejects_a_mismatch(client: TestClient):
    """A figure that disagrees means an entry is missing; it is reported, not padded away."""
    r = client.post("/api/balance", json={"account": CARD, "amount": 500.0, "date": "2026-09-01"})
    assert r.status_code == 422, r.text
    assert "spending or bill pay" in r.json()["detail"]

    assert CARD not in client.get("/api/networth?date=2026-09-01").json()["logged"]


def test_patch_liability_balance_keeps_the_owed_sign(client: TestClient):
    assert (
        client.post(
            "/api/balance", json={"account": CARD, "amount": CARD_OWED, "date": "2026-09-01"}
        ).status_code
        == 200
    )
    locator = client.get("/api/networth?date=2026-09-01").json()["logged"][CARD]["locator"]

    # editing to a figure that no longer holds is refused
    edit = client.post("/api/balance/update", json={"locator": locator, "amount": 999.0})
    assert edit.status_code >= 400
    at = client.get("/api/networth?date=2026-09-01").json()
    assert dict((a["account"], a["value"]) for a in at["accounts"])[CARD] == -CARD_OWED


def test_loggable_in_month_hides_an_account_opened_later(ledger_dir: Path):
    """A card opened in August is not offered in January: the month's roster is the month's, not
    today's."""
    account = "Liabilities:CC:LateCard"
    append_accounts(ledger_dir, f"\n2026-08-14 open {account} USD\n")

    _, jan = _load(ledger_dir).net_worth.loggable_in_month(dt.date(2026, 1, 1))
    _, aug = _load(ledger_dir).net_worth.loggable_in_month(dt.date(2026, 8, 1))
    assert account not in jan
    assert account in aug


def test_loggable_in_month_keeps_the_month_an_account_opened_or_closed_in(ledger_dir: Path):
    """Opening or closing part-way through a month still belongs to that month, and the one after
    drops it."""
    account = "Liabilities:CC:BriefCard"
    append_accounts(ledger_dir, f"\n2026-03-14 open {account} USD\n2026-05-20 close {account}\n")

    nw = _load(ledger_dir).net_worth
    shown = {m: account in nw.loggable_in_month(dt.date(2026, m, 1))[1] for m in (2, 3, 4, 5, 6)}
    assert shown == {2: False, 3: True, 4: True, 5: True, 6: False}


def test_loggable_in_month_still_excludes_a_passthrough(ledger_dir: Path):
    """Scoping to a month must not smuggle back an account whose balance belongs to its sweep
    destination rather than to itself."""
    passthrough = "Assets:Cash:Venmo"
    append_accounts(
        ledger_dir,
        f'\n2026-01-01 open {passthrough} USD\n  sweep_to: "Assets:Cash:BankA"\n',
    )

    nw = _load(ledger_dir).net_worth
    assets, _ = nw.loggable_in_month(SEP)
    assert passthrough not in assets
    assert passthrough not in nw.loggable_accounts()  # and the undated list agrees
    assert "Assets:Cash:BankA" in assets  # its destination is still offered


def test_post_liability_balance_accepts_a_credit(client: TestClient):
    """A card or tax account can stand in credit. Sent negative the way a statement reads it, it is
    stored positive; forcing the sign reported a refund due as more owed."""
    credit = "Liabilities:TaxesOwed"
    append_accounts(client.ledger_dir, f"\n2026-01-01 open {credit} USD\n")  # type: ignore[attr-defined]
    # a refund landing in the account leaves it in credit
    append_accounts(
        client.ledger_dir,  # type: ignore[attr-defined]
        f"""
        2026-08-15 * "tax refund"
          {credit}  898.00 USD
          Assets:Cash:BankA  -898.00 USD
        """,
    )

    r = client.post(
        "/api/balance", json={"account": credit, "amount": -898.0, "date": "2026-09-01"}
    )
    assert r.status_code == 200, r.text

    at = client.get("/api/networth?date=2026-09-01").json()
    assert at["logged"][credit]["amount"] == 898.0  # stored as a credit, not as owed
    assert dict((a["account"], a["value"]) for a in at["accounts"])[credit] == 898.0


def test_post_asset_balance_still_refuses_a_negative(client: TestClient):
    """Only a liability may go below zero. An account cannot hold less than nothing."""
    r = client.post(
        "/api/balance", json={"account": "Assets:Cash:BankA", "amount": -5.0, "date": "2026-09-01"}
    )
    assert r.status_code == 422, r.text
