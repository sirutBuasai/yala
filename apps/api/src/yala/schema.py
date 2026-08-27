"""The versioned ``data.json`` contract, validated by pydantic v2 with ``extra="forbid"``.

Additive changes keep ``SCHEMA_VERSION`` stable; breaking changes bump it.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict

from yala.money import round_cents

SCHEMA_VERSION = 1


class _Base(BaseModel):
    """Base for every contract model: reject unknown keys so drift fails loudly."""

    model_config = ConfigDict(extra="forbid")


class _ReservedSection(BaseModel):
    """A future domain section, reserved and empty in v1.

    Permissive (``extra="allow"``) so the section can be filled additively — a new domain adds
    its fields and flips its ``meta.domains`` flag without a schema-version bump.
    """

    model_config = ConfigDict(extra="allow")


class DateRange(_Base):
    start: str
    end: str


class Domains(_Base):
    """Which domains carry data."""

    spending: bool
    income: bool
    networth: bool
    investments: bool
    cards: bool


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


class NetWorthSection(_ReservedSection):
    """Reserved: derived assets − liabilities over time. Empty in v1."""


class InvestmentsSection(_ReservedSection):
    """Reserved: broker holdings / gain-loss. Empty in v1."""


class DashboardData(_Base):
    schema_version: Literal[1]
    generated_at: str  # RFC 3339 UTC
    currency: str

    meta: Meta
    overview: Overview
    years: dict[str, YearPage]  # keyed "YYYY"
    months: dict[str, MonthPage]  # keyed "YYYY-MM"
    income: IncomeSection

    # Reserved future domains
    networth: NetWorthSection | None = None
    investments: InvestmentsSection | None = None
    cards: list = []


def json_schema() -> dict:
    """The JSON Schema for the contract (the frontend codegens TS types from this)."""
    return DashboardData.model_json_schema()


def money(value: Decimal | int | float) -> float:
    """Normalize a ledger amount to a 2dp float (banker's rounding, via :mod:`yala.money`)."""
    return float(round_cents(value))
