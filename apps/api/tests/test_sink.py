"""FileLedgerSink tests over a tmp copy of the fixture ledger."""

from __future__ import annotations

import datetime as dt
import re
from decimal import Decimal
from pathlib import Path

import pytest
from beancount.core import data

from tests.conftest import load_ledger as _loads_clean
from yala.ledger import Ledger
from yala.sink import FileLedgerSink


def test_append_transaction_grows_file_and_loads(ledger_dir: Path):
    target = ledger_dir / "spending" / "2026.beancount"
    before = target.read_text()

    FileLedgerSink(ledger_dir).append_transaction(
        date=dt.date(2026, 2, 1),
        payee="new coffee",
        amount=Decimal("4.25"),
        category="Takeouts",
        funding_account="Liabilities:CC:CardA",
        pending=False,
    )

    text = target.read_text()
    appended = text[len(before) :]
    assert '"new coffee"' in appended
    assert "src:" not in appended
    assert "id:" in appended
    _loads_clean(ledger_dir)


def test_append_netted_transaction(ledger_dir: Path):
    """``amount`` is the whole bill; the Expenses posting carries only the net share."""
    FileLedgerSink(ledger_dir).append_transaction(
        date=dt.date(2026, 2, 3),
        payee="dinner with friends",
        amount=Decimal("300.00"),
        category="Takeouts",
        funding_account="Liabilities:CC:CardA",
        credits=[("Assets:Cash:Wallet", Decimal("200.00"))],
    )
    led = _loads_clean(ledger_dir)

    entries = [t for t in led.spending.transactions() if t.payee == "dinner with friends"]
    assert len(entries) == 1
    txn = entries[0]
    assert txn.category == "Takeouts"
    assert txn.amount == Decimal("100.00")
    assert txn.bill == Decimal("300.00")

    # by_category counts the net share, not the whole bill.
    assert led.spending.by_category(2026, 2)["Takeouts"] == Decimal("100.00")

    text = (ledger_dir / "spending" / "2026.beancount").read_text()
    assert "bill: 300.00 USD" in text
    # beancount's printer controls column alignment, so assert content and not spacing.
    assert re.search(r"Expenses:Takeouts\s+100\.00 USD", text)
    assert re.search(r"Assets:Cash:Wallet\s+200\.00 USD", text)
    assert "-300.00 USD" in text  # funding paid the whole bill


def test_append_refund_yields_negative_net(ledger_dir: Path):
    """Credits exceeding the bill give a negative net expense, and it still loads."""
    FileLedgerSink(ledger_dir).append_transaction(
        date=dt.date(2026, 2, 4),
        payee="over-refunded dinner",
        amount=Decimal("50.00"),
        category="Takeouts",
        funding_account="Liabilities:CC:CardA",
        credits=[("Assets:Cash:Wallet", Decimal("80.00"))],  # credits exceed the bill
    )
    led = _loads_clean(ledger_dir)
    txn = [t for t in led.spending.transactions() if t.payee == "over-refunded dinner"][0]
    assert txn.amount == Decimal("-30.00")
    assert txn.bill == Decimal("50.00")

    text = (ledger_dir / "spending" / "2026.beancount").read_text()
    assert re.search(r"Expenses:Takeouts\s+-30\.00 USD", text)
    assert "-50.00 USD" in text  # funding still balances the whole bill


def test_update_transaction_replaces_in_place(ledger_dir: Path):
    sink = FileLedgerSink(ledger_dir)
    entry_id = sink.append_transaction(
        date=dt.date(2026, 2, 5),
        payee="lunch",
        amount=Decimal("40.00"),
        category="Takeouts",
        funding_account="Liabilities:CC:CardA",
        pending=True,
    )
    target = ledger_dir / "spending" / "2026.beancount"
    assert target.read_text().count('"lunch"') == 1

    new_id = sink.update_transaction(
        f"id:{entry_id}",
        payee="lunch",
        amount=Decimal("40.00"),
        category="Takeouts",
        funding_account="Liabilities:CC:CardA",
        pending=False,
        credits=[("Assets:Cash:Wallet", Decimal("25.00"))],
    )
    assert new_id == entry_id

    text = target.read_text()
    assert text.count('"lunch"') == 1
    assert '2026-02-05 * "lunch"' in text  # the pending flag was cleared
    led = _loads_clean(ledger_dir)
    txn = [t for t in led.spending.transactions() if t.payee == "lunch"][0]
    assert txn.amount == Decimal("15.00")
    assert txn.bill == Decimal("40.00")
    assert txn.pending is False


def test_update_by_line_locator_assigns_id(ledger_dir: Path):
    """An entry with no id is addressable only by line; updating one assigns a stable id."""
    led = Ledger(ledger_dir / "main.beancount", strict=True).load()
    fitness = [t for t in led.spending.transactions() if t.payee == "Example Gym"][0]
    assert fitness.locator.startswith("line:")

    new_id = FileLedgerSink(ledger_dir).update_transaction(
        fitness.locator,
        payee="Example Gym",
        amount=Decimal("109.95"),
        category="Subscription",
        funding_account="Liabilities:CC:CardB",
    )
    assert new_id

    led2 = _loads_clean(ledger_dir)
    updated = [t for t in led2.spending.transactions() if t.payee == "Example Gym"][0]
    assert updated.locator == f"id:{new_id}"
    assert updated.amount == Decimal("109.95")


def test_line_locator_is_ledger_relative(ledger_dir: Path, monkeypatch):
    """A line-locator stays ledger-relative, so no private absolute path leaks into data.json."""
    import yala.config as config_mod

    monkeypatch.setattr(config_mod, "LEDGER_DIR", ledger_dir)

    led = Ledger(ledger_dir / "main.beancount", strict=True).load()
    fitness = [t for t in led.spending.transactions() if t.payee == "Example Gym"][0]

    assert fitness.locator.startswith("line:")
    assert str(ledger_dir) not in fitness.locator

    rel, _, _ = fitness.locator[len("line:") :].rpartition(":")
    assert not rel.startswith("/")
    assert (ledger_dir / rel).exists()

    new_id = FileLedgerSink(ledger_dir).update_transaction(
        fitness.locator,
        payee="Example Gym",
        amount=Decimal("109.95"),
        category="Subscription",
        funding_account="Liabilities:CC:CardB",
    )
    assert new_id


def test_update_rolls_back_on_broken_ledger(ledger_dir: Path):
    sink = FileLedgerSink(ledger_dir)
    entry_id = sink.append_transaction(
        date=dt.date(2026, 2, 7),
        payee="groc",
        amount=Decimal("20.00"),
        category="Grocery",
        funding_account="Liabilities:CC:CardA",
    )
    target = ledger_dir / "spending" / "2026.beancount"
    before = target.read_text()

    with pytest.raises(Exception):
        sink.update_transaction(
            f"id:{entry_id}",
            payee="groc",
            amount=Decimal("20.00"),
            category="Grocery",
            funding_account="Assets:Cash:NonExistent",  # unopened account -> load error
        )

    assert target.read_text() == before
    _loads_clean(ledger_dir)


# Resolved payroll accounts, as the API layer maps option labels onto them.
_EMPLOYER = "Income:Salary:Employer1"
_TAX = "Expenses:Deductions:Tax"
_INSURANCE = "Expenses:Deductions:Insurance"
_HSA = "Assets:Investments:TaxAdvantaged:Broker1HSA"
_K401 = "Assets:Investments:TaxAdvantaged:Employer401k"


def test_append_paycheck_balances_and_loads(ledger_dir: Path):
    FileLedgerSink(ledger_dir).append_paycheck(
        date=dt.date(2026, 2, 15),
        gross=Decimal("3000.00"),
        income_account=_EMPLOYER,
        deduction_legs=[(_TAX, Decimal("600.00")), (_INSURANCE, Decimal("100.00"))],
        contribution_legs=[(_HSA, None, Decimal("150.00")), (_K401, "Roth401k", Decimal("600.00"))],
        deposit_account="Assets:Cash:BankB",
    )
    text = (ledger_dir / "income" / "2026.beancount").read_text()
    assert text.count('"paycheck"') == 2
    assert "id:" in text
    _loads_clean(ledger_dir)


def test_append_paycheck_splits_share_one_account_via_meta(ledger_dir: Path):
    """Split contributions post to the SAME account, tagged by a ``label`` posting-meta, so net
    worth sees one holding while income breaks the split out."""
    sink = FileLedgerSink(ledger_dir)
    entry_id = sink.append_paycheck(
        date=dt.date(2026, 2, 15),
        gross=Decimal("3000.00"),
        income_account=_EMPLOYER,
        deduction_legs=[(_TAX, Decimal("600.00"))],
        contribution_legs=[
            (_K401, "Roth401k", Decimal("400.00")),
            (_K401, "Trad401k", Decimal("200.00")),
        ],
        deposit_account="Assets:Cash:BankB",
    )
    text = (ledger_dir / "income" / "2026.beancount").read_text()
    assert 'label: "Roth401k"' in text
    assert 'label: "Trad401k"' in text
    assert f"{_K401}:" not in text  # no split sub-accounts — one shared account, tagged by meta

    # Income relabels each split distinctly from the posting meta...
    led = _loads_clean(ledger_dir)
    pc = next(p for p in led.income.paychecks(2026, 2) if p.locator == f"id:{entry_id}")
    assert pc.contributions == {"Roth401k": Decimal("400.00"), "Trad401k": Decimal("200.00")}


def test_paycheck_to_unopened_deposit_account_raises_not_found(ledger_dir: Path):
    """An unopened deposit account is rejected before anything is written."""
    target = ledger_dir / "income" / "2026.beancount"
    before = target.read_bytes()

    with pytest.raises(ValueError) as exc:
        FileLedgerSink(ledger_dir).append_paycheck(
            date=dt.date(2026, 2, 15),
            gross=Decimal("1000.00"),
            income_account=_EMPLOYER,
            deduction_legs=[(_TAX, Decimal("100.00"))],
            contribution_legs=[],
            deposit_account="Assets:Cash:NonExistent",  # never opened
        )
    msg = str(exc.value)
    assert msg.startswith("unable to insert transaction:")
    assert "Assets:Cash:NonExistent" in msg
    assert "does not exist" in msg
    assert target.read_bytes() == before


def test_paycheck_to_closed_account_raises_closed(ledger_dir: Path):
    """A paycheck dated after the deposit account's close is rejected."""
    with pytest.raises(ValueError) as exc:
        FileLedgerSink(ledger_dir).append_paycheck(
            date=dt.date(2025, 3, 2),
            gross=Decimal("1000.00"),
            income_account=_EMPLOYER,
            deduction_legs=[],
            contribution_legs=[],
            deposit_account="Liabilities:CC:CardD",  # closed 2024-10-01
        )
    msg = str(exc.value)
    assert "Liabilities:CC:CardD" in msg
    assert "is closed as of date" in msg


def test_paycheck_with_unopened_contribution_account_raises(ledger_dir: Path):
    """The active-on-date check covers the contribution legs, not just the deposit."""
    with pytest.raises(ValueError) as exc:
        FileLedgerSink(ledger_dir).append_paycheck(
            date=dt.date(2026, 2, 15),
            gross=Decimal("1000.00"),
            income_account=_EMPLOYER,
            deduction_legs=[],
            contribution_legs=[
                ("Assets:Investments:Brokerage", None, Decimal("100.00"))
            ],  # unopened
            deposit_account="Assets:Cash:BankB",
        )
    assert "Assets:Investments:Brokerage" in str(exc.value)
    assert "does not exist" in str(exc.value)


def test_paycheck_with_wrong_legs_raises(ledger_dir: Path):
    with pytest.raises(ValueError):
        FileLedgerSink(ledger_dir).append_paycheck(
            date=dt.date(2026, 3, 1),
            gross=Decimal("1000.00"),
            income_account=_EMPLOYER,
            deduction_legs=[(_TAX, Decimal("900.00"))],
            contribution_legs=[(_K401, "Roth401k", Decimal("500.00"))],  # exceeds gross
            deposit_account="Assets:Cash:BankB",
        )


def test_update_paycheck_edits_in_place(ledger_dir: Path):
    sink = FileLedgerSink(ledger_dir)
    entry_id = sink.append_paycheck(
        date=dt.date(2026, 2, 15),
        gross=Decimal("3000.00"),
        income_account=_EMPLOYER,
        deduction_legs=[(_TAX, Decimal("600.00"))],
        contribution_legs=[(_HSA, None, Decimal("150.00"))],
        deposit_account="Assets:Cash:BankB",
    )
    target = ledger_dir / "income" / "2026.beancount"
    assert target.read_text().count('"paycheck"') == 2  # the fixture's, plus this one

    new_id = sink.update_paycheck(
        f"id:{entry_id}",
        gross=Decimal("3200.00"),
        income_account=_EMPLOYER,
        deduction_legs=[(_TAX, Decimal("640.00"))],
        contribution_legs=[(_HSA, None, Decimal("160.00"))],
        deposit_account="Assets:Cash:BankB",
    )
    assert new_id == entry_id
    assert target.read_text().count('"paycheck"') == 2

    led = _loads_clean(ledger_dir)
    pc = led.income.paychecks(2026, 2)[0]
    assert pc.gross == Decimal("3200.00")
    assert pc.deductions == {"Tax": Decimal("640.00")}
    assert pc.contributions == {"HSA": Decimal("160.00")}


def test_update_paycheck_across_year_moves_file(ledger_dir: Path):
    sink = FileLedgerSink(ledger_dir)
    entry_id = sink.append_paycheck(
        date=dt.date(2026, 3, 15),
        gross=Decimal("3000.00"),
        income_account=_EMPLOYER,
        deduction_legs=[(_TAX, Decimal("600.00"))],
        contribution_legs=[],
        deposit_account="Assets:Cash:BankB",
    )
    sink.update_paycheck(
        f"id:{entry_id}",
        date=dt.date(2027, 3, 15),  # crosses into 2027
        gross=Decimal("3000.00"),
        income_account=_EMPLOYER,
        deduction_legs=[(_TAX, Decimal("600.00"))],
        contribution_legs=[],
        deposit_account="Assets:Cash:BankB",
    )
    assert '"paycheck"' not in "".join(
        line
        for line in (ledger_dir / "income" / "2026.beancount").read_text().splitlines()
        if "2026-03" in line or "3000" in line
    )
    led = _loads_clean(ledger_dir)
    moved = led.income.paychecks(2027, 3)
    assert len(moved) == 1
    assert moved[0].locator == f"id:{entry_id}"
    assert 'include "income/2027.beancount"' in (ledger_dir / "income.beancount").read_text()


def test_update_paycheck_to_unopened_account_rejected(ledger_dir: Path):
    sink = FileLedgerSink(ledger_dir)
    entry_id = sink.append_paycheck(
        date=dt.date(2026, 2, 15),
        gross=Decimal("1000.00"),
        income_account=_EMPLOYER,
        deduction_legs=[],
        contribution_legs=[],
        deposit_account="Assets:Cash:BankB",
    )
    target = ledger_dir / "income" / "2026.beancount"
    before = target.read_bytes()

    with pytest.raises(ValueError, match="does not exist"):
        sink.update_paycheck(
            f"id:{entry_id}",
            gross=Decimal("1000.00"),
            income_account=_EMPLOYER,
            deduction_legs=[],
            contribution_legs=[],
            deposit_account="Assets:Cash:Unopened",
        )
    assert target.read_bytes() == before
    _loads_clean(ledger_dir)


def test_new_year_file_creates_include(ledger_dir: Path):
    FileLedgerSink(ledger_dir).append_transaction(
        date=dt.date(2027, 1, 5),
        payee="future latte",
        amount=Decimal("5.00"),
        category="Takeouts",
        funding_account="Liabilities:CC:CardA",
    )
    assert (ledger_dir / "spending" / "2027.beancount").exists()
    # the include joins the aggregator, not main
    assert 'include "spending/2027.beancount"' in (ledger_dir / "spending.beancount").read_text()
    assert 'include "spending/2027.beancount"' not in (ledger_dir / "main.beancount").read_text()
    _loads_clean(ledger_dir)

    # a second 2027 entry reuses the same file and include
    FileLedgerSink(ledger_dir).append_transaction(
        date=dt.date(2027, 2, 9),
        payee="another future latte",
        amount=Decimal("6.00"),
        category="Takeouts",
        funding_account="Liabilities:CC:CardA",
    )
    assert (ledger_dir / "spending.beancount").read_text().count(
        'include "spending/2027.beancount"'
    ) == 1
    _loads_clean(ledger_dir)


def test_open_account_declares_the_account(ledger_dir: Path):
    FileLedgerSink(ledger_dir).open_account("Assets:Investments:Brokerage")
    led = _loads_clean(ledger_dir)
    assert "Assets:Investments:Brokerage" in led.declared_accounts("Assets:Investments:")


def _open_file(ledger_dir: Path, account: str) -> Path:
    """The source file declaring ``account``'s ``open`` directive."""
    for e in _loads_clean(ledger_dir).entries:
        if isinstance(e, data.Open) and e.account == account:
            return Path(e.meta["filename"])
    raise AssertionError(f"no open for {account}")


def test_open_account_escapes_a_quote_in_metadata(ledger_dir: Path):
    """A quote or backslash in a typed value is escaped, so the file still parses."""
    sink = FileLedgerSink(ledger_dir)

    sink.open_account("Assets:Cash:Quoted", meta={"institution_name": 'Bank "X" \\ Example'})

    led = _loads_clean(ledger_dir)
    opened = next(
        e for e in led.entries if isinstance(e, data.Open) and e.account == "Assets:Cash:Quoted"
    )
    assert opened.meta["institution_name"] == 'Bank "X" \\ Example'


def test_set_account_meta_escapes_a_quote(ledger_dir: Path):
    sink = FileLedgerSink(ledger_dir)
    sink.open_account("Assets:Cash:Tagged")

    sink.set_account_meta("Assets:Cash:Tagged", "institution_name", 'A "B"')

    led = _loads_clean(ledger_dir)
    opened = next(
        e for e in led.entries if isinstance(e, data.Open) and e.account == "Assets:Cash:Tagged"
    )
    assert opened.meta["institution_name"] == 'A "B"'


def test_open_account_lands_beside_its_siblings(ledger_dir: Path):
    """A new open joins the file that already declares its family."""
    sink = FileLedgerSink(ledger_dir)
    family_file = _open_file(ledger_dir, "Expenses:Grocery")

    sink.open_account("Expenses:Gifts")

    assert "open Expenses:Gifts" in family_file.read_text()
    assert "Expenses:Gifts" in _loads_clean(ledger_dir).declared_accounts("Expenses:")


def test_set_account_metas_sets_and_removes_several_keys_in_one_write(ledger_dir: Path):
    """Descriptive metadata is edited as a set, so committing key by key would leave a half-applied
    form behind on a rejected value."""
    sink = FileLedgerSink(ledger_dir)
    sink.open_account(
        "Assets:Cash:Tagged", meta={"institution_name": "Bank A", "institution_alias": "BA"}
    )

    sink.set_account_metas(
        "Assets:Cash:Tagged", {"institution_alias": None, "account_alias": "Checking"}
    )

    meta = _loads_clean(ledger_dir).account_meta()["Assets:Cash:Tagged"]
    assert meta["institution_name"] == "Bank A"  # untouched keys survive
    assert meta["account_alias"] == "Checking"
    assert "institution_alias" not in meta


def test_set_account_metas_on_an_unknown_account_raises(ledger_dir: Path):
    with pytest.raises(KeyError):
        FileLedgerSink(ledger_dir).set_account_metas("Assets:Cash:Ghost", {"institution_name": "A"})


@pytest.mark.parametrize("writer", ["open", "meta"])
def test_a_control_character_in_metadata_is_refused(ledger_dir: Path, writer: str):
    """Beancount accepts a raw newline inside a quoted string, so the strict reload would pass and
    the file would silently gain a line. The sink refuses it instead."""
    sink = FileLedgerSink(ledger_dir)

    with pytest.raises(ValueError, match="institution"):
        if writer == "open":
            sink.open_account("Assets:Cash:Bad", meta={"institution_name": "A\nB"})
        else:
            sink.set_account_meta("Assets:Cash:BankA", "institution", "A\nB")


def test_close_account_can_record_what_triggered_it(ledger_dir: Path):
    sink = FileLedgerSink(ledger_dir)
    sink.open_account("Expenses:Deductions:Scoped")

    sink.close_account(
        "Expenses:Deductions:Scoped", meta={"closed_with": "Income:Salary:Employer1"}
    )

    close = next(
        e
        for e in _loads_clean(ledger_dir).entries
        if isinstance(e, data.Close) and e.account == "Expenses:Deductions:Scoped"
    )
    assert close.meta["closed_with"] == "Income:Salary:Employer1"


# --- multi-file writes ---


def test_rewrite_files_commits_several_files_as_one_unit(ledger_dir: Path):
    touched = [p for p in ledger_dir.glob("**/*.beancount") if "Expenses:Takeouts" in p.read_text()]
    assert len(touched) > 1  # the point of the primitive

    FileLedgerSink(ledger_dir).rewrite_files(
        {p: p.read_text().replace("Expenses:Takeouts", "Expenses:Dining") for p in touched}
    )

    led = _loads_clean(ledger_dir)
    assert "Expenses:Dining" in led.active_accounts("Expenses:")
    assert "Expenses:Takeouts" not in led.declared_accounts("Expenses:")


def test_rewrite_files_rolls_every_file_back_when_the_result_is_broken(ledger_dir: Path):
    """The unit of rollback is the set, not the file: a rename that half-applied would leave the
    ledger naming an account that no longer exists everywhere else."""
    sink = FileLedgerSink(ledger_dir)
    accounts_file = ledger_dir / "accounts.beancount"
    spending_file = ledger_dir / "spending" / "2026.beancount"
    before = {p: p.read_text() for p in (accounts_file, spending_file)}

    with pytest.raises(Exception):
        # The postings move but the declaration does not, so the reload fails.
        sink.rewrite_files(
            {
                accounts_file: accounts_file.read_text() + "\n; touched\n",
                spending_file: spending_file.read_text().replace(
                    "Expenses:Takeouts", "Expenses:Undeclared"
                ),
            }
        )

    assert {p: p.read_text() for p in (accounts_file, spending_file)} == before


def test_rewrite_files_with_nothing_to_do_is_a_no_op(ledger_dir: Path):
    before = (ledger_dir / "accounts.beancount").read_text()

    FileLedgerSink(ledger_dir).rewrite_files({})

    assert (ledger_dir / "accounts.beancount").read_text() == before


def test_close_account_deactivates_category(ledger_dir: Path):
    sink = FileLedgerSink(ledger_dir)
    sink.open_account("Expenses:Gifts")
    open_file = _open_file(ledger_dir, "Expenses:Gifts")

    sink.close_account("Expenses:Gifts")

    assert "close Expenses:Gifts" in open_file.read_text()  # close sits with its open
    led = _loads_clean(ledger_dir)
    assert "Expenses:Gifts" in led.declared_accounts("Expenses:")
    assert "Expenses:Gifts" not in led.active_accounts("Expenses:")


# --- transfers (bill pay) ---


def test_append_transfer_lists_as_transfer_only(ledger_dir: Path):
    tid = FileLedgerSink(ledger_dir).append_transfer(
        date=dt.date(2026, 2, 15),
        from_account="Assets:Cash:BankA",
        to_account="Liabilities:CC:CardA",
        amount=Decimal("250.00"),
        payee="card autopay",
    )
    led = _loads_clean(ledger_dir)
    xfers = led.transfers.transactions(2026, 2)

    assert [t.locator for t in xfers] == [f"id:{tid}"]
    assert xfers[0].from_account == "Assets:Cash:BankA"
    assert xfers[0].to_account == "Liabilities:CC:CardA"
    assert xfers[0].amount == Decimal("250.00")
    # a transfer is neither spending nor income
    assert all(s.payee != "card autopay" for s in led.spending.transactions())
    assert all(p.payee != "card autopay" for p in led.income.paychecks())


def test_update_transfer_in_place(ledger_dir: Path):
    sink = FileLedgerSink(ledger_dir)
    tid = sink.append_transfer(
        date=dt.date(2026, 2, 15),
        from_account="Assets:Cash:BankA",
        to_account="Liabilities:CC:CardA",
        amount=Decimal("250.00"),
    )
    new_id = sink.update_transfer(
        f"id:{tid}",
        from_account="Assets:Cash:BankB",
        to_account="Liabilities:CC:CardA",
        amount=Decimal("300.00"),
    )

    assert new_id == tid
    t = _loads_clean(ledger_dir).transfers.transactions(2026, 2)[0]
    assert t.from_account == "Assets:Cash:BankB"
    assert t.amount == Decimal("300.00")


def test_update_transfer_across_year_relocates(ledger_dir: Path):
    sink = FileLedgerSink(ledger_dir)
    tid = sink.append_transfer(
        date=dt.date(2026, 2, 15),
        from_account="Assets:Cash:BankA",
        to_account="Liabilities:CC:CardA",
        amount=Decimal("250.00"),
    )
    sink.update_transfer(
        f"id:{tid}",
        from_account="Assets:Cash:BankA",
        to_account="Liabilities:CC:CardA",
        amount=Decimal("250.00"),
        date=dt.date(2027, 1, 3),
    )
    led = _loads_clean(ledger_dir)

    assert led.transfers.transactions(2026, 2) == []
    moved = led.transfers.transactions(2027, 1)
    assert len(moved) == 1 and moved[0].locator == f"id:{tid}"
    assert 'include "transfers/2027.beancount"' in (ledger_dir / "transfers.beancount").read_text()


def test_delete_transfer(ledger_dir: Path):
    sink = FileLedgerSink(ledger_dir)
    tid = sink.append_transfer(
        date=dt.date(2026, 2, 15),
        from_account="Assets:Cash:BankA",
        to_account="Liabilities:CC:CardA",
        amount=Decimal("250.00"),
    )
    sink.delete_entry(f"id:{tid}")

    assert _loads_clean(ledger_dir).transfers.transactions() == []


# --- delete ---


def test_delete_spending_transaction_by_id(ledger_dir: Path):
    sink = FileLedgerSink(ledger_dir)
    entry_id = sink.append_transaction(
        date=dt.date(2026, 2, 8),
        payee="delete me",
        amount=Decimal("18.00"),
        category="Takeouts",
        funding_account="Liabilities:CC:CardA",
    )
    before = _loads_clean(ledger_dir).spending.count()
    assert [t for t in _loads_clean(ledger_dir).spending.transactions() if t.payee == "delete me"]

    sink.delete_entry(f"id:{entry_id}")

    led = _loads_clean(ledger_dir)
    assert led.spending.count() == before - 1
    assert not [t for t in led.spending.transactions() if t.payee == "delete me"]


def test_delete_paycheck_by_locator(ledger_dir: Path):
    led = _loads_clean(ledger_dir)
    paycheck = led.income.paychecks(2025, 8)[0]
    net_before = led.income.net(2025)

    FileLedgerSink(ledger_dir).delete_entry(paycheck.locator)

    led2 = _loads_clean(ledger_dir)
    assert led2.income.paychecks(2025, 8) == []
    assert led2.income.net(2025) == net_before - paycheck.net


def test_delete_unknown_locator_raises_and_leaves_files_intact(ledger_dir: Path):
    target = ledger_dir / "spending" / "2026.beancount"
    before = target.read_bytes()

    with pytest.raises(KeyError):
        FileLedgerSink(ledger_dir).delete_entry("id:does-not-exist")

    assert target.read_bytes() == before
    _loads_clean(ledger_dir)


# --- regressions: each of these was a real bug ---


def test_update_preserves_narration_tag_and_custom_meta(ledger_dir: Path):
    """A round-trip update keeps the entry's narration, tags, and custom meta."""
    target = ledger_dir / "spending" / "2026.beancount"
    target.write_text(
        target.read_text() + '\n2026-03-15 * "store" "weekly groceries" #recurring\n'
        '  id: "fixed-id-123"\n'
        '  note: "split with roommate"\n'
        "  Expenses:Grocery  50.00 USD\n"
        "  Liabilities:CC:CardA  -50.00 USD\n"
    )
    _loads_clean(ledger_dir)

    FileLedgerSink(ledger_dir).update_transaction(
        "id:fixed-id-123",
        payee="store",
        amount=Decimal("45.00"),
        category="Grocery",
        funding_account="Liabilities:CC:CardA",
        credits=[("Assets:Cash:Wallet", Decimal("5.00"))],
    )

    led = _loads_clean(ledger_dir)
    from beancount.core import data

    entry = [
        e
        for e in led.entries
        if isinstance(e, data.Transaction) and e.meta.get("id") == "fixed-id-123"
    ][0]
    assert entry.narration == "weekly groceries"
    assert "recurring" in entry.tags
    assert entry.meta.get("note") == "split with roommate"
    assert entry.meta.get("funding") == "Liabilities:CC:CardA"
    assert "src" not in entry.meta  # retired key is not carried forward


def test_update_narration_only_entry_does_not_duplicate_into_payee(ledger_dir: Path):
    """An entry written with a single string has that string as its narration, not its payee, and
    the UI shows it as the title. Saving the title back must not duplicate it into both fields."""
    from beancount.core import data

    target = ledger_dir / "spending" / "2026.beancount"
    target.write_text(
        target.read_text() + '\n2026-07-01 * "boba"\n'  # single string == narration, no payee
        '  id: "narr-only"\n'
        "  Expenses:Takeouts  6.50 USD\n"
        "  Liabilities:CC:CardA  -6.50 USD\n"
    )
    original = [
        e
        for e in Ledger(ledger_dir / "main.beancount", strict=True).load().entries
        if isinstance(e, data.Transaction) and e.meta.get("id") == "narr-only"
    ][0]
    assert original.payee is None and original.narration == "boba"

    FileLedgerSink(ledger_dir).update_transaction(
        "id:narr-only",
        payee="boba",  # the UI resends the title, which came from the narration
        amount=Decimal("6.50"),
        category="Takeouts",
        funding_account="Liabilities:CC:CardA",
    )

    led = _loads_clean(ledger_dir)
    entry = [
        e
        for e in led.entries
        if isinstance(e, data.Transaction) and e.meta.get("id") == "narr-only"
    ][0]
    assert entry.payee == "boba"
    assert not entry.narration  # dropped, not duplicated into the narration
    assert '"boba" "boba"' not in target.read_text()


def test_quantize_first_balances(ledger_dir: Path):
    """Legs are quantized before net/funding are derived, so equal odd-cent legs still balance."""
    FileLedgerSink(ledger_dir).append_transaction(
        date=dt.date(2026, 4, 1),
        payee="odd cents",
        amount=Decimal("10.005"),
        category="Takeouts",
        funding_account="Liabilities:CC:CardA",
        credits=[("Assets:Cash:Wallet", Decimal("10.005"))],
    )
    led = _loads_clean(ledger_dir)  # loads without residual-balance errors
    txn = [t for t in led.spending.transactions() if t.payee == "odd cents"][0]
    # each leg rounds to 10.00 before the subtraction, so the net is exactly zero
    assert txn.amount == Decimal("0.00")


def test_funding_meta_beats_more_negative_split(ledger_dir: Path):
    """Funding is read from the meta, not from the most-negative-leg heuristic."""
    FileLedgerSink(ledger_dir).append_transaction(
        date=dt.date(2026, 4, 5),
        payee="netted dinner",
        amount=Decimal("100.00"),
        category="Takeouts",
        funding_account="Liabilities:CC:CardA",
        # A credit leg more negative than the funding card would fool the heuristic.
        credits=[
            ("Assets:Cash:Wallet", Decimal("200.00")),
            ("Assets:Receivable:Friends", Decimal("-400.00")),
        ],
    )
    led = _loads_clean(ledger_dir)
    txn = [t for t in led.spending.transactions() if t.payee == "netted dinner"][0]
    assert txn.source == "Liabilities:CC:CardA"  # from the meta, not the most-negative leg


def test_update_raises_on_stale_line_locator(ledger_dir: Path, monkeypatch):
    """If the resolver hands back a lineno that no longer holds that entry, refuse the write."""
    from beancount.core import data

    import yala.sink.writer as sink_mod

    led = Ledger(ledger_dir / "main.beancount", strict=True).load()
    txns = {
        (e.payee or e.narration): e
        for e in led.entries
        if isinstance(e, data.Transaction) and (e.payee or e.narration)
    }
    boba = txns["boba"]
    fitness = txns["Example Gym"]
    # One entry resolved, but pointing at another entry's line: a stale locator.
    stale = boba._replace(meta={**boba.meta, "lineno": fitness.meta["lineno"]})
    monkeypatch.setattr(sink_mod, "find_entry", lambda entries, locator: stale)

    target = ledger_dir / "spending" / "2026.beancount"
    before = target.read_bytes()
    with pytest.raises(ValueError, match="stale locator"):
        FileLedgerSink(ledger_dir).update_transaction(
            "line:whatever:0",
            payee="boba",
            amount=Decimal("7.98"),
            category="Takeouts",
            funding_account="Liabilities:CC:CardA",
        )
    assert target.read_bytes() == before


def test_failed_reload_leaves_file_byte_identical(ledger_dir: Path):
    """A write that fails the strict reload restores the original bytes exactly."""
    sink = FileLedgerSink(ledger_dir)
    entry_id = sink.append_transaction(
        date=dt.date(2026, 5, 1),
        payee="restore me",
        amount=Decimal("12.00"),
        category="Takeouts",
        funding_account="Liabilities:CC:CardA",
    )
    target = ledger_dir / "spending" / "2026.beancount"
    before = target.read_bytes()

    with pytest.raises(Exception):
        sink.update_transaction(
            f"id:{entry_id}",
            payee="restore me",
            amount=Decimal("12.00"),
            category="Takeouts",
            funding_account="Assets:Cash:Unopened",
        )
    assert target.read_bytes() == before


def test_update_does_not_swallow_next_entry_across_whitespace_line(ledger_dir: Path):
    """A whitespace-only line ends an entry span rather than reading as a continuation."""
    target = ledger_dir / "spending" / "2026.beancount"
    target.write_text(
        target.read_text() + '\n2026-06-01 * "first"\n'
        '  id: "ws-first"\n'
        "  Expenses:Takeouts  5.00 USD\n"
        "  Liabilities:CC:CardA  -5.00 USD\n"
        "   \n"  # whitespace-only separator line
        '2026-06-02 * "second"\n'
        '  id: "ws-second"\n'
        "  Expenses:Takeouts  6.00 USD\n"
        "  Liabilities:CC:CardA  -6.00 USD\n"
    )
    _loads_clean(ledger_dir)

    FileLedgerSink(ledger_dir).update_transaction(
        "id:ws-first",
        payee="first",
        amount=Decimal("9.00"),
        category="Takeouts",
        funding_account="Liabilities:CC:CardA",
    )
    led = _loads_clean(ledger_dir)
    second = [t for t in led.spending.transactions() if t.payee == "second"]
    assert len(second) == 1
    assert second[0].amount == Decimal("6.00")


# --- date-edit that crosses a year boundary relocates the entry ---


def test_update_across_year_moves_entry_to_new_year_file(ledger_dir: Path):
    """A date edit into another year relocates the entry, creating that year's file and its
    include when needed."""
    sink = FileLedgerSink(ledger_dir)
    entry_id = sink.append_transaction(
        date=dt.date(2026, 2, 5),
        payee="moving txn",
        amount=Decimal("30.00"),
        category="Takeouts",
        funding_account="Liabilities:CC:CardA",
    )
    src_file = ledger_dir / "spending" / "2026.beancount"
    assert '"moving txn"' in src_file.read_text()

    new_id = sink.update_transaction(
        f"id:{entry_id}",
        payee="moving txn",
        amount=Decimal("30.00"),
        category="Takeouts",
        funding_account="Liabilities:CC:CardA",
        date=dt.date(2027, 3, 9),  # crosses 2026 -> 2027
    )
    assert new_id == entry_id

    dst_file = ledger_dir / "spending" / "2027.beancount"
    assert '"moving txn"' not in src_file.read_text()
    assert '"moving txn"' in dst_file.read_text()
    assert '2027-03-09 * "moving txn"' in dst_file.read_text()
    assert 'include "spending/2027.beancount"' in (ledger_dir / "spending.beancount").read_text()

    led = _loads_clean(ledger_dir)
    moved = [t for t in led.spending.transactions() if t.payee == "moving txn"]
    assert len(moved) == 1
    assert moved[0].date == dt.date(2027, 3, 9)
    assert moved[0].locator == f"id:{entry_id}"


def test_update_across_year_with_bad_account_leaves_old_file_intact(ledger_dir: Path):
    """A rejected year-crossing edit leaves the original year file untouched."""
    sink = FileLedgerSink(ledger_dir)
    entry_id = sink.append_transaction(
        date=dt.date(2026, 2, 6),
        payee="stays put",
        amount=Decimal("22.00"),
        category="Takeouts",
        funding_account="Liabilities:CC:CardA",
    )
    src_file = ledger_dir / "spending" / "2026.beancount"
    before = src_file.read_bytes()

    with pytest.raises(Exception):
        sink.update_transaction(
            f"id:{entry_id}",
            payee="stays put",
            amount=Decimal("22.00"),
            category="Takeouts",
            funding_account="Assets:Cash:Unopened",
            date=dt.date(2027, 1, 1),  # would cross the year boundary
        )

    assert src_file.read_bytes() == before
    _loads_clean(ledger_dir)


# --- pre-write active-account validation ---


def test_append_before_funding_open_date_raises_clear_error(ledger_dir: Path):
    """A txn dated before the funding account opened is rejected, naming the account and date."""
    target = ledger_dir / "spending" / "2026.beancount"
    before = target.read_bytes()

    with pytest.raises(ValueError) as exc:
        FileLedgerSink(ledger_dir).append_transaction(
            date=dt.date(2026, 1, 5),
            payee="too early",
            amount=Decimal("10.00"),
            category="Takeouts",
            funding_account="Liabilities:CC:CardC",  # opened 2026-08-14
        )
    msg = str(exc.value)
    assert msg.startswith("unable to insert transaction:")
    assert "Liabilities:CC:CardC" in msg
    assert "2026-08-14" in msg
    assert "not open as of date" in msg
    assert target.read_bytes() == before


def test_append_after_close_date_raises_closed_error(ledger_dir: Path):
    """A txn dated on or after an account's close is rejected."""
    with pytest.raises(ValueError) as exc:
        FileLedgerSink(ledger_dir).append_transaction(
            date=dt.date(2025, 3, 2),
            payee="too late",
            amount=Decimal("10.00"),
            category="Takeouts",
            funding_account="Liabilities:CC:CardD",  # closed 2024-10-01
        )
    msg = str(exc.value)
    assert msg.startswith("unable to insert transaction:")
    assert "Liabilities:CC:CardD" in msg
    assert "is closed as of date 2025-03-02" in msg
    assert "closed 2024-10-01" in msg


def test_append_on_exact_open_date_succeeds(ledger_dir: Path):
    """An account opened exactly on the txn date is allowed."""
    FileLedgerSink(ledger_dir).append_transaction(
        date=dt.date(2026, 8, 14),  # == CardC open date
        payee="opening day",
        amount=Decimal("12.00"),
        category="Takeouts",
        funding_account="Liabilities:CC:CardC",
    )
    led = _loads_clean(ledger_dir)
    assert [t for t in led.spending.transactions() if t.payee == "opening day"]


def test_append_split_leg_before_open_date_raises(ledger_dir: Path):
    """The active-on-date check covers credit-leg accounts, not just funding."""
    with pytest.raises(ValueError) as exc:
        FileLedgerSink(ledger_dir).append_transaction(
            date=dt.date(2026, 1, 5),
            payee="early split",
            amount=Decimal("50.00"),
            category="Takeouts",
            funding_account="Liabilities:CC:CardA",  # active since 2020
            credits=[("Liabilities:CC:CardC", Decimal("20.00"))],  # opened 2026-08-14
        )
    assert "Liabilities:CC:CardC" in str(exc.value)
    assert "not open as of date" in str(exc.value)
