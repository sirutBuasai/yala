"""Build the versioned ``data.json`` from the ledger.

Querying the ledger and constructing the pydantic contract:
the builder emits a fully-validated :class:`~yala.schema.DashboardData`.

Run ``python -m yala.builder [OUT]`` to write the snapshot (default:
``apps/web/static/data.json``; overridable via arg or ``$YALA_DATA_OUT``).
"""

from __future__ import annotations

import datetime as dt
import os
import sys
from decimal import Decimal
from pathlib import Path

from yala.ledger import Ledger
from yala.ledger.income import Paycheck
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
    money,
)


def _now_rfc3339() -> str:
    return dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _paycheck_out(p: Paycheck) -> PaycheckOut:
    return PaycheckOut(
        date=p.date.isoformat(),
        payee=p.payee,
        employer=p.employer,
        gross=money(p.gross),
        deductions={k: money(v) for k, v in p.deductions.items()},
        contributions={k: money(v) for k, v in p.contributions.items()},
        net=money(p.net),
        take_home=money(p.take_home),
        locator=p.locator,
    )


def _meta(spending, income, categories, all_years, all_months) -> Meta:
    date_range = spending.date_range()

    return Meta(
        years=all_years,
        month_keys=[f"{y:04d}-{m:02d}" for y, m in all_months],
        transaction_count=spending.count(),
        date_range=(
            DateRange(start=date_range[0].isoformat(), end=date_range[1].isoformat())
            if date_range
            else None
        ),
        categories=categories,
        domains=Domains(
            spending=spending.count() > 0,
            income=len(income.paychecks()) > 0,
            networth=False,
            investments=False,
            cards=False,
        ),
    )


def _overview(spending, income, categories, all_years) -> Overview:
    all_time = spending.by_category()

    return Overview(
        by_year=[
            YearSpend(
                year=y,
                spent=money(spending.total(y)),
                income=money(income.net(y)),
                saved=money(income.net(y) - spending.total(y)),
            )
            for y in all_years
        ],
        all_time_by_category=[
            CategoryAmount(category=c, amount=money(all_time.get(c, 0))) for c in categories
        ],
    )


def _years(spending, income, all_years) -> dict[str, YearPage]:
    years: dict[str, YearPage] = {}

    for y in all_years:
        net_by_month = income.by_month(y)
        matrix = []

        for m in range(1, 13):
            month_cats = spending.by_category(y, m)
            matrix.append(
                MonthMatrixRow(
                    month=m,
                    spent={c: money(v) for c, v in month_cats.items() if v != 0},
                    income=money(net_by_month[m - 1]),
                )
            )

        years[f"{y:04d}"] = YearPage(
            total_spent=money(spending.total(y)),
            total_income=money(income.net(y)),
            matrix=matrix,
        )

    return years


def _months(spending, income, all_months) -> dict[str, MonthPage]:
    months: dict[str, MonthPage] = {}

    for y, m in all_months:
        by_cat = spending.by_category(y, m)
        by_category = sorted(
            (CategoryAmount(category=c, amount=money(v)) for c, v in by_cat.items() if v != 0),
            key=lambda ca: ca.amount,
            reverse=True,
        )

        txns = [
            Txn(
                date=t.date.isoformat(),
                payee=t.payee,
                amount=money(t.amount),
                category=t.category,
                source=t.source,
                pending=t.pending,
                locator=t.locator,
                bill=money(t.bill) if t.bill is not None else None,
            )
            for t in spending.transactions(y, m)
        ]

        months[f"{y:04d}-{m:02d}"] = MonthPage(
            total_spent=money(spending.total(y, m)),
            total_income=money(income.net(y, m)),
            by_category=by_category,
            transactions=txns,
            paychecks=[_paycheck_out(p) for p in income.paychecks(y, m)],
        )

    return months


def _income(income) -> IncomeSection:
    recent = sorted(income.paychecks(), key=lambda p: p.date, reverse=True)

    return IncomeSection(
        by_year=[
            IncomeYear(
                year=y,
                gross=money(income.gross(y)),
                net=money(income.net(y)),
                take_home=money(income.take_home(y)),
                deductions=money(sum(income.deductions(y).values(), Decimal(0))),
                contributions=money(sum(income.contributions(y).values(), Decimal(0))),
            )
            for y in income.years()
        ],
        by_month={f"{y:04d}": [money(v) for v in income.by_month(y)] for y in income.years()},
        recent_paychecks=[_paycheck_out(p) for p in recent],
    )


def build(ledger: Ledger) -> DashboardData:
    """Query the ledger and validate / construct the dashboard contract."""
    spending = ledger.spending
    income = ledger.income

    categories = spending.categories()
    income_months = {(p.date.year, p.date.month) for p in income.paychecks()}
    all_months = sorted(set(spending.months()) | income_months)
    all_years = sorted(set(spending.years()) | set(income.years()))

    return DashboardData(
        schema_version=1,
        generated_at=_now_rfc3339(),
        currency=ledger.currency,
        meta=_meta(spending, income, categories, all_years, all_months),
        overview=_overview(spending, income, categories, all_years),
        years=_years(spending, income, all_years),
        months=_months(spending, income, all_months),
        income=_income(income),
    )


def build_dict() -> dict:
    """Live rebuild from the configured ledger, as a JSON-serializable dict (for the API)."""
    return build(Ledger().load()).model_dump(mode="json")


# The frontend reads its data snapshot from apps/web/static/data.json, which the vite build
# copies into apps/web/build/. Writing straight there means no intermediate build/ dir to copy.
_REPO_ROOT = Path(__file__).resolve().parents[4]
_DEFAULT_OUT = _REPO_ROOT / "apps" / "web" / "static" / "data.json"


def main(argv: list[str] | None = None) -> None:
    argv = sys.argv[1:] if argv is None else argv
    out = Path(argv[0]) if argv else Path(os.environ.get("YALA_DATA_OUT", _DEFAULT_OUT))
    data = build(Ledger().load())
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(data.model_dump_json(indent=2))
    print(f"wrote {out} ({len(data.months)} months, {len(data.years)} years)")


if __name__ == "__main__":
    main()
