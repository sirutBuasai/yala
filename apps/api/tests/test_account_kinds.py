"""The account-lifecycle domain: what kind an account is, what it is paired with, and what a rename
or a reopen would touch. Facts about the ledger, read without writing to it."""

from __future__ import annotations

from pathlib import Path

import pytest

from tests.conftest import (
    BANK_A,
    EMPLOYER,
    K401,
    PASSTHROUGH,
    SAVINGS,
    append_accounts,
    load_ledger,
)
from yala.ledger import accounts
from yala.ledger.constants import DEDUCTIONS

# --- classification ---


@pytest.mark.parametrize(
    "account,kind",
    [
        ("Expenses:Grocery", "category"),
        ("Expenses:Deductions:Tax", "deduction"),
        ("Assets:Cash:BankA", "bank"),
        ("Liabilities:CC:CardA", "card"),
        ("Assets:Investments:Taxable:AcctA", "investment"),
        ("Income:Salary:Employer1", "employer"),
    ],
)
def test_kind_of_reads_the_kind_off_the_prefix(account: str, kind: str):
    assert accounts.kind_of(account) is accounts.KINDS_BY_NAME[kind]


def test_deduction_wins_over_the_category_it_sits_under():
    """Both live under Expenses:, so prefix order is what keeps a deduction out of spending."""
    assert accounts.kind_of("Expenses:Deductions:Tax").name == "deduction"


@pytest.mark.parametrize(
    "account",
    [
        "Equity:Adjustments:BankA",
        "Equity:Opening-Balances",
        "Assets:GiftCard:Store",
        "Income:Other",
    ],
)
def test_kind_of_is_none_for_an_account_this_app_does_not_manage(account: str):
    assert accounts.kind_of(account) is None


@pytest.mark.parametrize(
    "account,tier",
    [
        ("Assets:Investments:Taxable:AcctA", "Taxable"),
        ("Assets:Investments:TaxAdvantaged:BrokerBHSA", "TaxAdvantaged"),
        ("Assets:Investments:Legacy:AcctA", None),
        ("Assets:Cash:BankA", None),
    ],
)
def test_tier_of_reads_the_segment_below_investments(account: str, tier: str | None):
    assert accounts.tier_of(account) == tier


def test_sweep_capabilities_are_stated_per_kind():
    """Which accounts sweep, and where a sweep may land, is the kind's own business rather than
    something inferred from a coincidence such as having a plug."""
    assert accounts.KINDS_BY_NAME["bank"].sweeps
    assert accounts.KINDS_BY_NAME["bank"].sweep_target
    # An investment holds a balance, so a sweep can land in it; it never sweeps out.
    assert accounts.KINDS_BY_NAME["investment"].sweep_target
    assert not accounts.KINDS_BY_NAME["investment"].sweeps
    assert not accounts.KINDS_BY_NAME["card"].sweeps
    assert not accounts.KINDS_BY_NAME["card"].sweep_target


# --- metadata reads ---


def test_employer_scope_reads_the_meta_and_treats_blank_as_unscoped():
    assert accounts.employer_scope({"employer": "Employer1"}) == "Employer1"
    assert accounts.employer_scope({"employer": ""}) is None
    assert accounts.employer_scope(None) is None


def test_labels_of_splits_and_trims_the_comma_joined_value():
    assert accounts.labels_of({"labels": "A, B ,C"}) == ["A", "B", "C"]
    assert accounts.labels_of({"labels": ""}) == []
    assert accounts.labels_of(None) == []


def test_sweep_destination_reads_the_passthrough_target(ledger_dir: Path):
    meta = load_ledger(ledger_dir).account_meta()
    assert accounts.sweep_destination(meta[PASSTHROUGH]) == SAVINGS
    assert accounts.sweep_destination(meta[BANK_A]) is None


# --- lifecycle facts ---


def test_declared_family_is_the_account_and_its_descendants(ledger_dir: Path):
    append_accounts(
        ledger_dir,
        """
        2020-01-01 open Assets:Investments:Taxable:Group:AcctA
        2020-01-01 open Assets:Investments:Taxable:GroupOther
        """,
    )
    led = load_ledger(ledger_dir)

    family = accounts.declared_family(led, "Assets:Investments:Taxable:Group")

    assert family == ["Assets:Investments:Taxable:Group:AcctA"]
    assert "Assets:Investments:Taxable:GroupOther" not in family


def test_sweep_referrers_names_who_sweeps_in(ledger_dir: Path):
    led = load_ledger(ledger_dir)

    assert accounts.sweep_referrers(led, SAVINGS) == [PASSTHROUGH]
    assert accounts.sweep_referrers(led, BANK_A) == []


def test_scoped_to_finds_only_the_accounts_naming_that_employer(ledger_dir: Path):
    led = load_ledger(ledger_dir)

    scoped = accounts.scoped_to(led, DEDUCTIONS, "Employer1")

    assert scoped == ["Expenses:Deductions:Employer1Benefit"]
    assert "Expenses:Deductions:Tax" not in scoped  # generic: serves every employer


def test_employer_links_are_its_deductions_and_its_plans(ledger_dir: Path):
    """What closing an employer has to decide about. A generic deduction serves every employer, so
    it is linked to none of them."""
    led = load_ledger(ledger_dir)

    linked = accounts.employer_links(led, EMPLOYER)

    assert "Expenses:Deductions:Employer1Benefit" in linked
    assert K401 in linked
    assert "Expenses:Deductions:Tax" not in linked


def test_employer_links_leaves_out_an_already_closed_account(ledger_dir: Path):
    """Only the active ones are a decision: a closed plan has nothing left to close or unlink."""
    led = load_ledger(ledger_dir)

    assert "Assets:Investments:TaxAdvantaged:LegacyPlan" not in accounts.employer_links(
        led, EMPLOYER
    )


def test_only_an_employer_links_anything(ledger_dir: Path):
    led = load_ledger(ledger_dir)

    assert accounts.employer_links(led, BANK_A) == []
    assert accounts.employer_links(led, "Expenses:Grocery") == []
