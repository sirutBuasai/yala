"""Where each write lands in its file.

A ledger file is organised, not a log: opens sit with opens, closes with closes, a balance under its
month's heading, an entry in date order. These check that every write finds its place rather than
appending to the end of whatever file it belongs to.
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from pathlib import Path

from tests.conftest import CARD_A as CARD
from tests.conftest import load_ledger as _loads_clean
from yala.ledger import placement
from yala.sink import FileLedgerSink


def _lineno(text: str, needle: str) -> int:
    """The 1-based line holding ``needle``, which must appear exactly once."""
    hits = [i for i, line in enumerate(text.splitlines(), start=1) if needle in line]

    assert len(hits) == 1, f"{needle!r} appears on {len(hits)} lines"
    return hits[0]


def _accounts(ledger_dir: Path) -> str:
    return (ledger_dir / "accounts.beancount").read_text()


def _spend(sink: FileLedgerSink, date: dt.date, payee: str) -> str:
    return sink.append_transaction(
        date=date, payee=payee, amount=Decimal("1.00"), category="Grocery", funding_account=CARD
    )


# --- account directives ---


def test_an_open_joins_its_siblings_rather_than_the_end_of_the_file(ledger_dir: Path):
    FileLedgerSink(ledger_dir).open_account("Income:Salary:Employer3", dt.date(2026, 9, 1))

    text = _accounts(ledger_dir)
    assert _lineno(text, "open Income:Salary:Employer3") == (
        _lineno(text, "open Income:Salary:Employer2") + 1
    )
    _loads_clean(ledger_dir)


def test_an_open_lands_above_the_closes_that_follow_its_group(ledger_dir: Path):
    """The employer group ends with a ``close``; a new employer belongs above it, not after."""
    FileLedgerSink(ledger_dir).open_account("Income:Salary:Employer3", dt.date(2026, 9, 1))

    text = _accounts(ledger_dir)
    assert _lineno(text, "open Income:Salary:Employer3") < _lineno(
        text, "close Income:Salary:Employer2"
    )


def test_a_close_joins_the_closes_for_its_group(ledger_dir: Path):
    sink = FileLedgerSink(ledger_dir)
    sink.open_account("Income:Salary:Employer3", dt.date(2026, 9, 1))
    sink.close_account("Income:Salary:Employer3", dt.date(2026, 9, 2))

    text = _accounts(ledger_dir)
    assert _lineno(text, "close Income:Salary:Employer3") == (
        _lineno(text, "close Income:Salary:Employer2") + 1
    )
    _loads_clean(ledger_dir)


def test_a_category_lands_with_the_other_categories(ledger_dir: Path):
    FileLedgerSink(ledger_dir).open_account("Expenses:GiftCards", dt.date(2026, 9, 1))

    text = _accounts(ledger_dir)
    assert _lineno(text, "open Expenses:GiftCards") == (_lineno(text, "open Expenses:Takeouts") + 1)
    _loads_clean(ledger_dir)


def test_an_open_predating_its_whole_group_goes_above_it(ledger_dir: Path):
    """The group stays in date order, so a back-dated open does not read as the newest."""
    FileLedgerSink(ledger_dir).open_account("Expenses:Amortization", dt.date(2019, 1, 1))

    text = _accounts(ledger_dir)
    assert _lineno(text, "open Expenses:Amortization") == (
        _lineno(text, "open Expenses:Grocery") - 1
    )
    _loads_clean(ledger_dir)


# --- the genesis assertion ---


def test_a_genesis_assertion_goes_to_the_balance_file_not_beside_the_open(ledger_dir: Path):
    """An assertion is a snapshot: it belongs with the other snapshots, under its month."""
    sink = FileLedgerSink(ledger_dir)
    sink.open_account("Assets:Cash:BankZ", dt.date(2026, 3, 1))
    sink.open_account("Equity:Adjustments:BankZ", dt.date(2026, 3, 1), currency=None)
    sink.assert_balance("Assets:Cash:BankZ", "0.00", date=dt.date(2026, 3, 1))

    assert "balance Assets:Cash:BankZ" not in _accounts(ledger_dir)
    text = (ledger_dir / "assets" / "2026.beancount").read_text()
    assert text.startswith("; ===== MAR 2026 =====\n")
    assert "balance Assets:Cash:BankZ" in text
    _loads_clean(ledger_dir)


def test_a_new_balance_file_is_wired_into_the_ledger(ledger_dir: Path):
    sink = FileLedgerSink(ledger_dir)
    sink.open_account("Assets:Cash:BankZ", dt.date(2026, 3, 1))
    sink.open_account("Equity:Adjustments:BankZ", dt.date(2026, 3, 1), currency=None)
    sink.assert_balance("Assets:Cash:BankZ", "0.00", date=dt.date(2026, 3, 1))

    assert 'include "assets.beancount"' in (ledger_dir / "main.beancount").read_text()
    assert 'include "assets/2026.beancount"' in (ledger_dir / "assets.beancount").read_text()


# --- balance files, sectioned by month ---


def test_each_month_gets_its_own_heading(ledger_dir: Path):
    sink = FileLedgerSink(ledger_dir)
    sink.log_balance(
        "Assets:Cash:BankA", Decimal("10.00"), dt.date(2026, 3, 2), "Equity:Adjustments:BankA"
    )
    sink.log_balance(
        "Assets:Cash:BankA", Decimal("20.00"), dt.date(2026, 4, 2), "Equity:Adjustments:BankA"
    )

    text = (ledger_dir / "assets" / "2026.beancount").read_text()
    assert _lineno(text, "===== MAR 2026 =====") < _lineno(text, "===== APR 2026 =====")
    _loads_clean(ledger_dir)


def test_a_second_snapshot_in_a_month_joins_that_month(ledger_dir: Path):
    """Anchored on the month's own entries: dated earlier than them, it would otherwise be filed
    above the heading it belongs under."""
    sink = FileLedgerSink(ledger_dir)
    sink.log_balance(
        "Assets:Cash:BankA", Decimal("10.00"), dt.date(2026, 3, 20), "Equity:Adjustments:BankA"
    )
    sink.log_balance(
        "Assets:Cash:BankB", Decimal("20.00"), dt.date(2026, 3, 2), "Equity:Adjustments:BankB"
    )

    text = (ledger_dir / "assets" / "2026.beancount").read_text()
    assert text.count("===== MAR 2026 =====") == 1
    assert _lineno(text, "===== MAR 2026 =====") < _lineno(text, "balance Assets:Cash:BankB")
    assert _lineno(text, "balance Assets:Cash:BankB") < _lineno(text, "balance Assets:Cash:BankA")
    _loads_clean(ledger_dir)


def test_a_liability_snapshot_lands_in_the_liability_file(ledger_dir: Path):
    owed = -_loads_clean(ledger_dir).holdings(CARD, dt.date(2026, 3, 1))["USD"]
    FileLedgerSink(ledger_dir).verify_balance(CARD, owed, dt.date(2026, 3, 2))

    text = (ledger_dir / "liabilities" / "2026.beancount").read_text()
    assert text.startswith("; ===== MAR 2026 =====\n")
    _loads_clean(ledger_dir)


# --- dated entries ---


def test_a_back_dated_entry_lands_in_date_order(ledger_dir: Path):
    sink = FileLedgerSink(ledger_dir)
    _spend(sink, dt.date(2026, 3, 1), "march")
    _spend(sink, dt.date(2026, 2, 1), "february")

    text = (ledger_dir / "spending" / "2026.beancount").read_text()
    assert _lineno(text, '"february"') < _lineno(text, '"march"')
    _loads_clean(ledger_dir)


def test_re_dating_an_entry_moves_it_into_order(ledger_dir: Path):
    sink = FileLedgerSink(ledger_dir)
    _spend(sink, dt.date(2026, 3, 1), "march")
    moved = _spend(sink, dt.date(2026, 5, 1), "moved")

    sink.update_transaction(
        f"id:{moved}",
        payee="moved",
        amount=Decimal("1.00"),
        category="Grocery",
        funding_account=CARD,
        date=dt.date(2026, 2, 1),
    )

    text = (ledger_dir / "spending" / "2026.beancount").read_text()
    assert text.count('"moved"') == 1
    assert _lineno(text, '"moved"') < _lineno(text, '"march"')
    _loads_clean(ledger_dir)


def test_re_dating_into_another_year_leaves_no_gap_behind(ledger_dir: Path):
    sink = FileLedgerSink(ledger_dir)
    moved = _spend(sink, dt.date(2026, 5, 1), "moved")

    sink.update_transaction(
        f"id:{moved}",
        payee="moved",
        amount=Decimal("1.00"),
        category="Grocery",
        funding_account=CARD,
        date=dt.date(2025, 5, 1),
    )

    stayed = (ledger_dir / "spending" / "2026.beancount").read_text()
    assert '"moved"' not in stayed
    assert "\n\n\n" not in stayed
    assert '"moved"' in (ledger_dir / "spending" / "2025.beancount").read_text()
    _loads_clean(ledger_dir)


def test_deleting_an_entry_takes_its_blank_line_with_it(ledger_dir: Path):
    sink = FileLedgerSink(ledger_dir)
    doomed = _spend(sink, dt.date(2026, 3, 1), "doomed")
    _spend(sink, dt.date(2026, 4, 1), "kept")

    sink.delete_entry(f"id:{doomed}")

    text = (ledger_dir / "spending" / "2026.beancount").read_text()
    assert "\n\n\n" not in text
    _loads_clean(ledger_dir)


def test_a_new_year_file_joins_the_includes_in_order(ledger_dir: Path):
    _spend(FileLedgerSink(ledger_dir), dt.date(2024, 5, 1), "older year")

    lines = (ledger_dir / "spending.beancount").read_text().splitlines()
    assert lines == sorted(lines)
    assert 'include "spending/2024.beancount"' == lines[0]
    _loads_clean(ledger_dir)


# --- the placement rules themselves ---


def test_a_directive_with_no_group_to_join_lands_at_the_end_spaced_off():
    lines = ["2020-01-01 open Assets:Cash:BankA USD\n"]

    text = placement.splice(
        lines,
        placement.insert_at(lines, [], dt.date(2026, 1, 1), spaced=False),
        "2026-01-01 close Assets:Cash:BankA",
        spaced=True,
    )

    assert text.endswith("USD\n\n2026-01-01 close Assets:Cash:BankA\n")


def test_a_cut_shifts_the_anchors_below_it():
    anchors = [
        placement.Span(0, 1, dt.date(2026, 1, 1)),
        placement.Span(2, 3, dt.date(2026, 2, 1)),
        placement.Span(4, 5, dt.date(2026, 3, 1)),
    ]

    assert placement.without(anchors, 2, 2) == [
        placement.Span(0, 1, dt.date(2026, 1, 1)),
        placement.Span(2, 3, dt.date(2026, 3, 1)),
    ]


def test_a_month_heading_never_depends_on_the_locale():
    assert placement.month_header(dt.date(2026, 9, 1)) == "; ===== SEP 2026 ====="
