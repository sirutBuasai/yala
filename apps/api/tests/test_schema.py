"""Contract model tests."""

from __future__ import annotations

from typing import get_args

import pytest
from pydantic import ValidationError

from yala.ledger.accounts import KIND_FIELDS, KINDS, TIERS
from yala.schema import (
    SCHEMA_VERSION,
    AccountInfo,
    AccountKind,
    CategoryAmount,
    DashboardData,
    DateRange,
    Domains,
    IncomeSection,
    IncomeYear,
    KindName,
    Meta,
    MonthMatrixRow,
    MonthPage,
    Overview,
    PaycheckOut,
    TierName,
    Txn,
    YearPage,
    YearSpend,
)


def example_data() -> DashboardData:
    """A small, fully-fake document (2 years, a couple months) to exercise the contract."""
    return DashboardData(
        schema_version=SCHEMA_VERSION,
        generated_at="2025-01-15T12:00:00Z",
        currency="USD",
        meta=Meta(
            years=[2024, 2025],
            month_keys=["2024-12", "2025-01"],
            transaction_count=3,
            date_range=DateRange(start="2024-12-05", end="2025-01-20"),
            categories=["Grocery", "Takeouts"],
            accounts={
                "Liabilities:CC:CardA": AccountInfo(name="Card A", institution_name="BankA"),
                "Expenses:Grocery": AccountInfo(name="Grocery"),
            },
            domains=Domains(
                spending=True,
                income=True,
            ),
        ),
        overview=Overview(
            by_year=[
                YearSpend(year=2024, spent=120.00, income=2300.00, saved=2180.00),
                YearSpend(year=2025, spent=45.50, income=2300.00, saved=2254.50),
            ],
            all_time_by_category=[
                CategoryAmount(category="Grocery", amount=100.00),
                CategoryAmount(category="Takeouts", amount=65.50),
            ],
        ),
        years={
            "2025": YearPage(
                total_spent=45.50,
                total_income=2300.00,
                matrix=[
                    MonthMatrixRow(
                        month=m,
                        spent={"Grocery": 45.50} if m == 1 else {},
                        income=2300.00 if m == 1 else 0.00,
                    )
                    for m in range(1, 13)
                ],
            ),
        },
        months={
            "2025-01": MonthPage(
                total_spent=45.50,
                total_income=2300.00,
                by_category=[
                    CategoryAmount(category="Grocery", amount=30.00),
                    CategoryAmount(category="Takeouts", amount=15.50),
                ],
                transactions=[
                    Txn(
                        date="2025-01-20",
                        payee="Example Grocery",
                        amount=30.00,
                        category="Grocery",
                        source="Liabilities:CC:CardA",
                        pending=False,
                        locator="line:spending/2025.beancount:5",
                        bill=None,
                    ),
                    Txn(
                        date="2025-01-18",
                        payee="Example Cafe",
                        amount=15.50,
                        category="Takeouts",
                        source="Liabilities:CC:CardA",
                        pending=True,
                        locator="id:00000000-0000-0000-0000-000000000001",
                        bill=50.00,
                    ),
                ],
                paychecks=[
                    PaycheckOut(
                        date="2025-01-15",
                        payee="paycheck",
                        gross=3000.00,
                        deductions={"Tax": 600.00, "Insurance": 100.00},
                        contributions={"HSA": 150.00, "401k": 600.00},
                        net=2300.00,
                        take_home=1550.00,
                        locator="id:00000000-0000-0000-0000-000000000002",
                    ),
                ],
            ),
        },
        income=IncomeSection(
            by_year=[
                IncomeYear(
                    year=2024,
                    gross=3000.00,
                    net=2300.00,
                    take_home=1550.00,
                    deductions=700.00,
                    contributions=750.00,
                ),
                IncomeYear(
                    year=2025,
                    gross=3000.00,
                    net=2300.00,
                    take_home=1550.00,
                    deductions=700.00,
                    contributions=750.00,
                ),
            ],
            by_month={
                "2025": [2300.00] + [0.00] * 11,
            },
            recent_paychecks=[
                PaycheckOut(
                    date="2025-01-15",
                    payee="paycheck",
                    gross=3000.00,
                    deductions={"Tax": 600.00, "Insurance": 100.00},
                    contributions={"HSA": 150.00, "401k": 600.00},
                    net=2300.00,
                    take_home=1550.00,
                    locator="id:00000000-0000-0000-0000-000000000002",
                ),
            ],
        ),
    )


def test_extra_key_is_rejected():
    payload = example_data().model_dump()
    payload["surprise"] = "not allowed"
    with pytest.raises(ValidationError):
        DashboardData(**payload)


def test_account_info_carries_the_whole_record():
    """One authoritative per-account entry: a form prefills from this rather than deriving anything
    about an account for itself."""
    info = AccountInfo(
        name="Broker A Roth",
        institution_name="Broker A",
        kind="investment",
        tier="TaxAdvantaged",
        closed=False,
        opened="2026-03-01",
        institution_alias="BA",
        account_alias="Roth",
        employer="Employer1",
        labels=["OptionA", "OptionB"],
    )

    assert info.model_dump()["labels"] == ["OptionA", "OptionB"]
    assert info.sweep_to is None


def test_account_info_defaults_to_a_bare_name():
    """An account this app does not manage — a plug, an opening-balance account — still needs a
    name, and nothing else about it is known."""
    info = AccountInfo(name="Adjustments")

    assert info.kind is None and not info.closed and info.labels == []


def test_account_kind_rejects_an_unknown_kind():
    with pytest.raises(ValidationError):
        AccountKind(**{f: False for f in KIND_FIELDS} | {"name": "mystery", "prefix": "X:"})


# --- the contract cannot drift from the kind table it describes ---


def test_the_kind_names_match_the_ledgers_own():
    assert set(get_args(KindName)) == {k.name for k in KINDS}


def test_the_tier_names_match_the_ledgers_own():
    assert set(get_args(TierName)) == set(TIERS)


def test_every_kind_field_is_shipped_and_nothing_else_is():
    """`catalog.account_lists` copies these across by name, so a capability added to `Kind` reaches
    the form only if the contract carries a field of the same name."""
    assert set(AccountKind.model_fields) == set(KIND_FIELDS)


def test_a_kind_round_trips_into_the_contract_model():
    for kind in KINDS:
        shipped = AccountKind(**{f: getattr(kind, f) for f in KIND_FIELDS})

        assert shipped.name == kind.name
        assert shipped.prefix == kind.prefix
