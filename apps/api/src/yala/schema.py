"""The versioned ``data.json`` contract, validated by pydantic v2 with ``extra="forbid"``.

Additive changes keep ``SCHEMA_VERSION`` stable; breaking changes bump it.
"""

from __future__ import annotations

from typing import Literal, get_args

from pydantic import BaseModel, ConfigDict

#: Declared once as a ``Literal``, so a document carrying any other version fails validation.
SchemaVersion = Literal[1]
SCHEMA_VERSION: int = get_args(SchemaVersion)[0]

#: Spelled once for the whole contract. ``test_schema`` asserts they cannot drift from
#: :data:`yala.ledger.accounts.KINDS` / ``TIERS``.
KindName = Literal["category", "bank", "card", "investment", "employer", "deduction"]
TierName = Literal["Taxable", "TaxAdvantaged"]


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


class AccountInfo(_Base):
    """One account's whole record: what it is called, what it is, and what it carries. Every field
    is resolved from ledger metadata by the backend, so the naming rule has one implementation
    rather than one per language."""

    name: str  # display name, already shortened if the composed name overran the cap
    # The name in the parts it was typed in, and the short form of each. Null where the kind has no
    # such part, or for an account declared without them.
    institution_name: str | None = None
    account_name: str | None = None
    institution_alias: str | None = None
    account_alias: str | None = None
    color: str | None = None  # the institution's `#rrggbb`, used as-is in both themes
    kind: KindName | None = None  # null for an account this app does not manage
    tier: TierName | None = None  # investments only
    closed: bool = False
    opened: str | None = None  # "YYYY-MM-DD"
    employer: str | None = None  # scoping employer leaf; null = serves every employer
    labels: list[str] = []  # contribution line items this account offers
    sweep_to: str | None = None  # set on a passthrough, which holds no balance of its own


class Meta(_Base):
    years: list[int]
    month_keys: list[str]  # "YYYY-MM"
    transaction_count: int
    date_range: DateRange | None
    categories: list[str]
    accounts: dict[str, AccountInfo]  # every declared account, keyed by full path
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
    source: str | None  # the funding account that paid: a card or a cash account
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
    date: str  # "YYYY-MM-DD" — one point per logged snapshot day
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
    series: list[NetWorthSnapshot]  # one point per logged snapshot date, oldest first
    accounts: list[NetWorthAccount]  # current per-account breakdown
    adjustments: list[NetWorthAdjustment]  # per-account untracked-flow sanity check


class PayrollOption(_Base):
    """One selectable paycheck line, scoped to an employer (null = offered by every employer). A
    contribution always names one, that meta being what marks its account payroll-contributable."""

    kind: Literal["deduction", "contribution"]
    label: str
    employer: str | None
    account: str


class AccountKind(_Base):
    """What one kind of account is allowed to carry, so a form offers exactly the controls that
    apply. Copied off :data:`yala.ledger.accounts.KINDS`, which the routes enforce and which
    documents each flag, so the form and the API cannot disagree."""

    name: KindName
    #: Account-path prefix, so the frontend can resolve a leaf-keyed list to full paths instead of
    #: restating the ledger's taxonomy.
    prefix: str
    tiered: bool
    plugged: bool
    named: bool
    product: bool
    scopable: bool
    labelled: bool
    drains: bool
    splits: bool
    sweeps: bool
    sweep_target: bool


class AccountLists(_Base):
    """The pickable account sets the entry forms and the Manage panels choose from.

    Snapshotted into ``data.json`` as well as served live from ``/api/accounts`` so the forms still
    render when the local API is down. Writes are then refused by the frontend's write guard rather
    than by an absent list, since a form that vanishes reads as a missing feature.
    """

    kinds: list[AccountKind]
    spending_categories: list[str]  # leaf-relative, as a transaction names one
    # What a payment can come from or a refund can land in: cash accounts and cards together.
    funding_accounts: list[str]
    cash_accounts: list[str]
    card_accounts: list[str]
    investment_accounts: list[str]
    employers: list[str]
    deduction_accounts: list[str]
    payroll_options: list[PayrollOption]
    balance_accounts: list[str]  # snapshot-able: active cash + investments, passthroughs excluded
    liability_accounts: list[str]  # snapshot-able but verify-only: no plug to pad into
    sweeps: dict[str, str]  # passthrough account -> its sweep destination


class SettingField(_Base):
    """The spec behind one setting: how the form names it, bounds it, and explains it. Snapshotted
    alongside the values so the settings form renders with no API running."""

    key: str
    label: str
    kind: Literal["percent", "age", "year", "months"]
    min: float
    max: float
    default: float | None  # null = no sensible default; dependent features stay hidden
    help: str


class SettingsSection(_Base):
    """Effective user settings: what the ledger states, else the built-in default. A null means
    unset with no default, and features depending on it stay hidden rather than guessing."""

    swr: float  # withdrawal rate, percent
    real_return: float  # expected return above inflation, percent
    retire_age: float  # target retirement age
    runway_target: float  # months of spending to hold in cash
    birth_year: float | None = None  # unset → age-based projections hidden


class DashboardData(_Base):
    schema_version: SchemaVersion
    generated_at: str  # RFC 3339 UTC
    currency: str

    meta: Meta
    overview: Overview
    years: dict[str, YearPage]  # keyed "YYYY"
    months: dict[str, MonthPage]  # keyed "YYYY-MM"
    income: IncomeSection
    networth: NetWorthSection | None = None
    settings: SettingsSection | None = None
    setting_specs: list[SettingField] | None = None
    account_lists: AccountLists | None = None


def json_schema() -> dict:
    """The JSON Schema for the contract (the frontend codegens TS types from this)."""
    return DashboardData.model_json_schema()
