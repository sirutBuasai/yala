"""Payroll option resolution — shared by income (read), sink (write), and the accounts API."""

from __future__ import annotations

from decimal import Decimal
from pathlib import Path

from yala.ledger import Ledger, payroll
from yala.ledger.payroll import contribution_label, employer_of, summarize_paycheck

FIXTURE_LEDGER = Path(__file__).parent / "fixtures" / "ledger"

_K401 = "Assets:Investments:TaxAdvantaged:Employer401k"


def _ledger():
    return Ledger(FIXTURE_LEDGER / "main.beancount").load()


def test_employer_of_only_matches_salary_accounts():
    assert employer_of("Income:Salary:Employer1") == "Employer1"
    assert employer_of("Income:Bonus") is None
    assert employer_of("Assets:Cash:BankA") is None


def test_employers_lists_open_salary_accounts_only():
    assert payroll.employers(_ledger()) == ["Employer1"]  # Employer2 is closed


def test_options_are_scoped_and_derived_from_account_meta():
    opts = payroll.options(_ledger())
    contributions = {o.label for o in opts if o.kind == "contribution"}
    deductions = {o.label for o in opts if o.kind == "deduction"}

    assert {"Roth401k", "Trad401k", "AfterTax401k", "HSA"} <= contributions
    assert "Tax" in deductions
    # the 401k labels all resolve to the one shared holding account
    splits = [o for o in opts if o.label in {"Roth401k", "Trad401k", "AfterTax401k"}]
    assert {o.account for o in splits} == {_K401}


def test_resolve_matches_label_for_employer_else_none():
    led = _ledger()
    assert payroll.resolve(led, "contribution", "Roth401k", "Employer1").account == _K401
    assert payroll.resolve(led, "contribution", "Nonexistent", "Employer1") is None


def test_contribution_label_prefers_posting_label_then_sole_labels_then_leaf():
    assert contribution_label({}, "Assets:Investments:HSA", "Roth401k") == "Roth401k"
    assert contribution_label({"labels": "HSA"}, "Assets:Investments:X") == "HSA"
    assert contribution_label({"labels": "A,B"}, "Assets:Investments:Foo") == "Foo"


def test_summarize_paycheck_sums_same_label_and_splits_by_label():
    account_meta = {_K401: {"labels": "Roth401k,Trad401k,AfterTax401k"}}
    legs = [
        ("Income:Salary:Employer1", Decimal("-1000"), None),
        ("Expenses:Deductions:Tax", Decimal("200"), None),
        ("Expenses:Deductions:Tax", Decimal("50"), None),
        (_K401, Decimal("300"), "Roth401k"),
        (_K401, Decimal("200"), "Trad401k"),
        ("Assets:Cash:BankA", Decimal("250"), None),
    ]
    s = summarize_paycheck(legs, account_meta)

    assert s.gross == Decimal("1000")
    assert s.employer == "Employer1"
    assert s.deductions == {"Tax": Decimal("250")}  # same-label legs summed
    assert s.contributions == {"Roth401k": Decimal("300"), "Trad401k": Decimal("200")}
    assert s.other == [("Assets:Cash:BankA", Decimal("250"))]  # the deposit leg
