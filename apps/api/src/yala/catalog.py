"""What the user has, and what they can pick from it: the reference data every form needs.

Served live from ``/api/accounts`` and ``/api/settings`` *and* snapshotted into ``data.json``, so it
sits above both: a route asking the builder for the account lists would make the live path depend
on the file-writing one. The ledger package knows nothing about the wire contract; this is where the
two meet.
"""

from __future__ import annotations

from beancount.core import data

from yala.ledger import Ledger, accounts, payroll
from yala.ledger.constants import CASH, CREDIT_CARDS, DEDUCTIONS, INVESTMENTS
from yala.ledger.institutions import colors as institution_colors
from yala.ledger.naming import NAME_PARTS, account_name, institution_of
from yala.ledger.settings import SETTINGS
from yala.ledger.sweep import sweep_edges
from yala.schema import AccountInfo, AccountKind, AccountLists, PayrollOption, SettingField


def account_directory(ledger: Ledger) -> dict[str, AccountInfo]:
    """Every declared account's record: what it is called, what kind it is, and what it carries.

    Closed accounts included: they still appear in historical rows and are what a reopen offers, so
    a caller never needs a naming rule of its own for an account it can see.
    """
    account_meta = ledger.account_meta()
    palette = institution_colors(ledger.entries)
    active = set(ledger.active_accounts())
    opened = {e.account: e.date.isoformat() for e in ledger.entries if isinstance(e, data.Open)}

    def info(account: str, meta: dict) -> AccountInfo:
        institution = institution_of(meta)
        kind = accounts.kind_of(account)

        return AccountInfo(
            name=account_name(account, meta),
            color=palette.get(institution) if institution else None,
            kind=kind.name if kind else None,
            tier=accounts.tier_of(account),
            closed=account not in active,
            opened=opened.get(account),
            **{part.field: meta.get(part.field) for part in NAME_PARTS},
            employer=accounts.employer_scope(meta),
            labels=accounts.labels_of(meta),
            sweep_to=accounts.sweep_destination(meta),
        )

    return {account: info(account, meta) for account, meta in sorted(account_meta.items())}


def account_lists(ledger: Ledger) -> AccountLists:
    """The pickable account sets, for the forms and the Manage panels.

    Each list is a *pickability* rule the backend owns rather than a restatement of the directory:
    what a payment may come from, what may be snapshotted, what a paycheck may name. Shared by the
    snapshot and the accounts endpoint, which the frontend treats as interchangeable.
    """
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
    :data:`yala.ledger.settings.SETTINGS`."""
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
