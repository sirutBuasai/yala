#!/usr/bin/env python3
"""Generate the committed contract artifacts the frontend builds against.

Writes ``packages/contract/data.schema.json`` (JSON Schema → TS type codegen) and
``packages/contract/data.example.json`` (a fake document → dev-run without the real ledger).
Both are committed so the frontend never hand-maintains the contract shape.
"""

from __future__ import annotations

import json
from pathlib import Path

from yala import schema
from yala.schema import (
    CategoryAmount,
    DashboardData,
    DateRange,
    Domains,
    IncomeSection,
    IncomeYear,
    Meta,
    MonthMatrixRow,
    MonthPage,
    Overview,
    PaycheckOut,
    Txn,
    YearPage,
    YearSpend,
)

# The shared contract lives in packages/contract at the repo root.
OUT = Path(__file__).resolve().parents[3] / "packages" / "contract"


def example_data() -> DashboardData:
    """A small, fully-fake document (2 years, a couple months) for frontend/tests."""
    return DashboardData(
        schema_version=1,
        generated_at="2025-01-15T12:00:00Z",
        currency="USD",
        meta=Meta(
            years=[2024, 2025],
            month_keys=["2024-12", "2025-01"],
            transaction_count=3,
            date_range=DateRange(start="2024-12-05", end="2025-01-20"),
            categories=["Grocery", "Takeouts"],
            domains=Domains(
                spending=True,
                income=True,
                networth=False,
                investments=False,
                cards=False,
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
                        source="Liabilities:CC:ExampleCard",
                        pending=False,
                        locator="line:spending/2025.beancount:5",
                        bill=None,
                    ),
                    Txn(
                        date="2025-01-18",
                        payee="Example Cafe",
                        amount=15.50,
                        category="Takeouts",
                        source="Liabilities:CC:ExampleCard",
                        pending=True,
                        locator="id:00000000-0000-0000-0000-000000000001",
                        bill=50.00,
                    ),
                ],
                paychecks=[
                    PaycheckOut(
                        date="2025-01-15",
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


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "data.schema.json").write_text(json.dumps(schema.json_schema(), indent=2) + "\n")
    (OUT / "data.example.json").write_text(example_data().model_dump_json(indent=2) + "\n")
    print(f"wrote {OUT / 'data.schema.json'} and {OUT / 'data.example.json'}")


if __name__ == "__main__":
    main()
