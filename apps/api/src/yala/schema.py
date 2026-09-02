"""The versioned ``data.json`` contract, validated by pydantic v2 with ``extra="forbid"``.

Additive changes keep ``SCHEMA_VERSION`` stable; breaking changes bump it.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict

SCHEMA_VERSION = 1


class _Base(BaseModel):
    """Base for every contract model: reject unknown keys so drift fails loudly."""

    model_config = ConfigDict(extra="forbid")


class DateRange(_Base):
    start: str
    end: str


class Domains(_Base):
    """Which domains carry data."""

    spending: bool
    income: bool
    networth: bool = False


class Meta(_Base):
    years: list[int]
    month_keys: list[str]  # "YYYY-MM"
    transaction_count: int
    date_range: DateRange | None
    categories: list[str]
    domains: Domains


class YearSpend(_Base):
    year: int
    spent: float
    income: float  # net
    saved: float  # income - spent


class CategoryAmount(_Base):
    category: str
    amount: float


class Overview(_Base):
    by_year: list[YearSpend]
    all_time_by_category: list[CategoryAmount]


class MonthMatrixRow(_Base):
    month: int
    spent: dict[str, float]
    income: float  # net


class YearPage(_Base):
    total_spent: float
    total_income: float  # net
    matrix: list[MonthMatrixRow]


class Txn(_Base):
    date: str  # "YYYY-MM-DD"
    payee: str
    amount: float  # net share (the single Expenses posting)
    category: str
    source: str | None  # funding account that paid, e.g. "Liabilities:CC:ExampleCard"
    pending: bool
    locator: str  # stable edit handle: "id:<uuid>" or "line:<path>:<n>"
    bill: float | None = None  # pre-reimbursement total when the txn was split


class Transfer(_Base):
    date: str  # "YYYY-MM-DD"
    payee: str
    amount: float  # magnitude moved
    from_account: str
    to_account: str
    pending: bool
    locator: str


class PaycheckOut(_Base):
    date: str
    payee: str
    employer: str | None = None  # paying employer (Income:Salary:<Employer>), if known
    gross: float
    deductions: dict[str, float]
    contributions: dict[str, float]
    net: float
    take_home: float
    locator: str  # stable edit handle: "id:<uuid>" or "line:<path>:<n>"


class MonthPage(_Base):
    total_spent: float
    total_income: float
    by_category: list[CategoryAmount]
    transactions: list[Txn]
    paychecks: list[PaycheckOut]
    transfers: list[Transfer] = []


class IncomeYear(_Base):
    year: int
    gross: float
    net: float
    take_home: float
    deductions: float
    contributions: float


class IncomeSection(_Base):
    by_year: list[IncomeYear]
    by_month: dict[str, list[float]]
    recent_paychecks: list[PaycheckOut]


class NetWorthSnapshot(_Base):
    month: str  # "YYYY-MM"
    assets: float
    liabilities: float  # positive = owed
    net_worth: float  # assets - liabilities
    breakdown: dict[str, float]  # allocation bucket -> asset USD


class NetWorthAccount(_Base):
    account: str
    label: str
    group: str  # "cash" | "investment" | "liability"
    bucket: str  # allocation bucket: "Liquid" | "Taxable" | "Tax-advantaged" | "liability"
    value: float


class NetWorthAdjustment(_Base):
    account: str  # the Equity:Adjustments:* plug
    label: str
    value: float  # cumulative untracked-flow plug


class NetWorthSection(_Base):
    current: NetWorthSnapshot | None  # latest snapshot, or null when none logged yet
    series: list[NetWorthSnapshot]  # monthly trend, oldest first
    accounts: list[NetWorthAccount]  # current per-account breakdown
    adjustments: list[NetWorthAdjustment]  # per-account untracked-flow sanity check


class DashboardData(_Base):
    schema_version: Literal[1]
    generated_at: str  # RFC 3339 UTC
    currency: str

    meta: Meta
    overview: Overview
    years: dict[str, YearPage]  # keyed "YYYY"
    months: dict[str, MonthPage]  # keyed "YYYY-MM"
    income: IncomeSection
    networth: NetWorthSection | None = None


def json_schema() -> dict:
    """The JSON Schema for the contract (the frontend codegens TS types from this)."""
    return DashboardData.model_json_schema()
