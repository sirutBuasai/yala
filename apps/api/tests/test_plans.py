"""What a rename or a reopen plans to rewrite, checked before anything is written."""

from __future__ import annotations

from pathlib import Path

import pytest

from tests.conftest import BANK_A, EMPLOYER, K401, PASSTHROUGH, append_accounts, load_ledger
from yala.ledger import plans


def test_rename_problem_accepts_a_plain_rename(ledger_dir: Path):
    assert plans.rename_problem(load_ledger(ledger_dir), BANK_A, "Assets:Cash:BankZ") is None


def test_rename_problem_accepts_an_investment_tier_move(ledger_dir: Path):
    """The tier is a path segment, so moving between tiers is a rename, not a metadata edit."""
    led = load_ledger(ledger_dir)

    problem = plans.rename_problem(led, K401, "Assets:Investments:Taxable:Employer401k")

    assert problem is None


@pytest.mark.parametrize(
    "old,new,expected",
    [
        (BANK_A, BANK_A, "matches the current one"),
        (BANK_A, "Assets:Cash:BankB", "already exists"),
        (BANK_A, "Expenses:BankA", "not the same kind"),
        ("Assets:Cash:Ghost", "Assets:Cash:BankZ", "does not exist"),
        ("Equity:Opening-Balances", "Equity:Other", "not a renameable account"),
    ],
)
def test_rename_problem_refuses(ledger_dir: Path, old: str, new: str, expected: str):
    problem = plans.rename_problem(load_ledger(ledger_dir), old, new)

    assert problem is not None and expected in problem


def test_rename_problem_refuses_merging_two_employers(ledger_dir: Path):
    """Employer2 is closed in the fixture; any declared name is refused, so a rename can never fold
    one employer's history into another's."""
    problem = plans.rename_problem(load_ledger(ledger_dir), EMPLOYER, "Income:Salary:Employer2")

    assert problem is not None and "merge" in problem


def test_rename_map_carries_the_paired_plug(ledger_dir: Path):
    led = load_ledger(ledger_dir)

    renames = plans.rename_map(led, BANK_A, "Assets:Cash:BankZ")

    assert renames == {
        BANK_A: "Assets:Cash:BankZ",
        "Equity:Adjustments:BankA": "Equity:Adjustments:BankZ",
    }


def test_rename_map_repoints_the_plug_when_the_tier_changes(ledger_dir: Path):
    led = load_ledger(ledger_dir)

    renames = plans.rename_map(led, K401, "Assets:Investments:Taxable:Employer401k")

    assert renames["Equity:Adjustments:Investments:TaxAdvantaged:Employer401k"] == (
        "Equity:Adjustments:Investments:Taxable:Employer401k"
    )


def test_rename_map_omits_a_plug_that_was_never_declared(ledger_dir: Path):
    led = load_ledger(ledger_dir)

    renames = plans.rename_map(led, PASSTHROUGH, "Assets:Cash:Through")

    assert renames == {PASSTHROUGH: "Assets:Cash:Through"}


def test_reopen_targets_takes_the_account_its_plug_and_its_cascade(ledger_dir: Path):
    append_accounts(
        ledger_dir,
        """
        2026-08-25 close Income:Salary:Employer1
        2026-08-25 close Expenses:Deductions:Employer1Benefit
          closed_with: "Income:Salary:Employer1"
        """,
    )
    led = load_ledger(ledger_dir)

    closes = {e.account for e in plans.reopen_targets(led, EMPLOYER)}

    assert closes == {EMPLOYER, "Expenses:Deductions:Employer1Benefit"}


def test_reopen_targets_leaves_a_close_nobody_cascaded(ledger_dir: Path):
    """A deduction closed on its own account carries no marker, so a rehire leaves it alone."""
    append_accounts(
        ledger_dir,
        """
        2026-08-24 close Expenses:Deductions:Insurance
        2026-08-25 close Income:Salary:Employer1
        """,
    )
    led = load_ledger(ledger_dir)

    closes = {e.account for e in plans.reopen_targets(led, EMPLOYER)}

    assert closes == {EMPLOYER}
