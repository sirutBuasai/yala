"""The reference data every form needs, served live and snapshotted. Sits above both, so the live
path never depends on the file-writing one."""

from __future__ import annotations

from beancount.core import data

from yala.ledger import Ledger, accounts, cards, payroll
from yala.ledger.constants import CASH, CREDIT_CARDS, DEDUCTIONS, EXPENSES, INVESTMENTS
from yala.ledger.naming import NAME_PARTS, account_name, institution_of
from yala.ledger.sweep import sweep_edges
from yala.schema import AccountInfo, AccountKind, AccountLists, PayrollOption, SettingField
from yala.user_settings import read as read_settings
from yala.user_settings.colors import CATEGORIES, INSTITUTIONS, starting_color
from yala.user_settings.specs import SETTINGS


def color_key(account: str, meta: dict | None) -> tuple[str, str] | None:
    """``(family, name)`` an account's colour is kept under: its institution's, else a category's
    own, else none, as for an employer or a deduction."""
    if institution := institution_of(meta):
        return INSTITUTIONS, institution
    if accounts.kind_of(account) is accounts.KINDS_BY_NAME["category"]:
        return CATEGORIES, account.removeprefix(EXPENSES)
    return None


def account_directory(ledger: Ledger) -> dict[str, AccountInfo]:
    """Closed accounts included: they appear in historical rows and are what a reopen offers."""
    account_meta = ledger.account_meta()
    settings = read_settings(ledger.path)
    active = set(ledger.active_accounts())
    opened = {e.account: e.date.isoformat() for e in ledger.entries if isinstance(e, data.Open)}

    def info(account: str, meta: dict) -> AccountInfo:
        kind = accounts.kind_of(account)

        return AccountInfo(
            name=account_name(account, meta),
            color=settings.color(*key) if (key := color_key(account, meta)) else None,
            default_color=starting_color(*key) if key else None,
            kind=kind.name if kind else None,
            tier=accounts.tier_of(account),
            closed=account not in active,
            opened=opened.get(account),
            **{part.field: meta.get(part.field) for part in NAME_PARTS},
            employer=accounts.employer_scope(meta),
            labels=accounts.labels_of(meta),
            sweep_to=accounts.sweep_destination(meta),
            includes_pending=cards.includes_pending(meta) if kind and kind.reconciled else None,
        )

    return {account: info(account, meta) for account, meta in sorted(account_meta.items())}


def account_lists(ledger: Ledger) -> AccountLists:
    """Each list is a pickability rule the backend owns. Shared by the snapshot and the accounts
    endpoint, which the frontend treats as interchangeable."""
    cash = ledger.active_accounts(CASH)
    cards = ledger.active_accounts(CREDIT_CARDS)

    return AccountLists(
        # Copied field-for-field off the kind table, so a new capability reaches the form without
        # anyone restating it here.
        kinds=[
            AccountKind(**{f: getattr(k, f) for f in accounts.KIND_FIELDS}) for k in accounts.KINDS
        ],
        spending_categories=ledger.spending.categories(),
        funding_accounts=sorted(cash + cards),
        cash_accounts=cash,
        card_accounts=cards,
        investment_accounts=ledger.active_accounts(INVESTMENTS),
        employers=payroll.employers(ledger),
        deduction_accounts=ledger.active_accounts(DEDUCTIONS),
        payroll_options=[
            PayrollOption(kind=o.kind, label=o.label, employer=o.employer, account=o.account)
            for o in payroll.options(ledger)
        ],
        balance_accounts=ledger.net_worth.loggable_accounts(),
        liability_accounts=ledger.net_worth.loggable_liabilities(),
        sweeps=sweep_edges(ledger),
    )


def setting_fields() -> list[SettingField]:
    """The spec behind every setting, as the form needs it, from
    :data:`yala.user_settings.specs.SETTINGS`."""
    return [
        SettingField(
            key=s.key,
            label=s.label,
            kind=s.kind,
            min=float(s.minimum),
            max=float(s.maximum),
            default=None if s.default is None else float(s.default),
            help=s.help,
        )
        for s in SETTINGS
    ]
