"""Payroll option resolution, shared by read (income), write (sink), and the accounts API.

Options are derived from account metadata so beancount stays the source of truth:

* employers     — the leaf of an ``Income:Salary:*`` account.
* deductions    — every ``Expenses:Deductions:*`` account, labelled by its leaf. Its ``employer``
  meta scopes it to one employer; without one it is offered by every employer.
* contributions — an ``Assets:Investments:*`` account carrying an ``employer`` meta, whose presence
  *is* the payroll-contributable marker. Its comma-separated ``labels`` meta lists the line items it
  offers.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass, field
from decimal import Decimal
from typing import TYPE_CHECKING

from yala.ledger.accounts import employer_scope, labels_of
from yala.ledger.constants import DEDUCTIONS, INCOME, INVESTMENTS, SALARY
from yala.ledger.paths import leaf

if TYPE_CHECKING:
    from yala.ledger.core import Ledger

# A posting reduced to what paycheck classification needs: (account, amount, ``label`` meta).
Leg = tuple[str, Decimal, str | None]


@dataclass(frozen=True)
class PayrollOption:
    """A selectable paycheck line item resolved to its ledger account."""

    kind: str  # "deduction" | "contribution"
    label: str  # for a contribution, also the ``label`` posting-meta the sink stamps
    account: str
    employer: str | None  # scoping employer, or None for generic


def employer_of(account: str) -> str | None:
    """The employer an ``Income:Salary:<Employer>`` posting belongs to, else ``None``."""
    return leaf(account) if account.startswith(SALARY) else None


def employers(ledger: "Ledger") -> list[str]:
    """Active employers: leaf of open, non-closed ``Income:Salary:*`` accounts."""
    return [leaf(a) for a in ledger.active_accounts(SALARY)]


def contribution_label(meta: dict, account: str, label: str | None = None) -> str:
    """Label for a contribution leg: its ``label`` posting-meta if tagged, else the account's sole
    ``labels`` entry (an untagged single-label account), else the account leaf."""
    if label:
        return label

    labels = labels_of(meta)
    return labels[0] if len(labels) == 1 else leaf(account)


def options(ledger: "Ledger") -> list[PayrollOption]:
    """Every payroll deduction/contribution option on offer, across all employers (filter by one).

    An option scoped to an employer who has been closed is dropped: no paycheck can be written
    against that employer, so offering its line items would be offering something unusable.
    """
    meta = ledger.account_meta()
    active_employers = set(employers(ledger))
    out: list[PayrollOption] = []

    for account in ledger.active_accounts():
        m = meta.get(account, {})
        employer = employer_scope(m)

        if employer is not None and employer not in active_employers:
            continue

        if account.startswith(DEDUCTIONS):
            out.append(PayrollOption("deduction", leaf(account), account, employer))

        elif account.startswith(INVESTMENTS) and employer:
            for label in labels_of(m) or [leaf(account)]:
                out.append(PayrollOption("contribution", label, account, employer))

    return out


def resolve(ledger: "Ledger", kind: str, label: str, employer: str) -> PayrollOption | None:
    """Find the option for ``(kind, label)`` available to ``employer`` (or generic)."""
    for o in options(ledger):
        if o.kind == kind and o.label == label and o.employer in (None, employer):
            return o

    return None


@dataclass
class PaycheckSummary:
    """A paycheck's postings classified for display/editing.

    ``other`` holds the postings outside Income/Deductions/Investments — the deposit candidates.
    """

    gross: Decimal
    employer: str | None
    deductions: dict[str, Decimal]
    contributions: dict[str, Decimal]
    other: list[tuple[str, Decimal]] = field(default_factory=list)


def summarize_paycheck(legs: Iterable[Leg], account_meta: dict[str, dict]) -> PaycheckSummary:
    """Classify paycheck ``legs`` into gross, employer, and deduction/contribution maps.

    Contributions are keyed by display label and same-label legs sum, so a split reads back as one
    total per line item.
    """
    gross = Decimal(0)
    employer: str | None = None
    deductions: dict[str, Decimal] = defaultdict(lambda: Decimal(0))
    contributions: dict[str, Decimal] = defaultdict(lambda: Decimal(0))
    other: list[tuple[str, Decimal]] = []

    for account, amount, label in legs:
        if account.startswith(INCOME):
            gross += -amount  # Income postings are credits (negative)
            employer = employer_of(account) or employer
        elif account.startswith(DEDUCTIONS):
            deductions[leaf(account)] += amount
        elif account.startswith(INVESTMENTS):
            key = contribution_label(account_meta.get(account, {}), account, label)
            contributions[key] += amount
        else:
            other.append((account, amount))

    return PaycheckSummary(gross, employer, dict(deductions), dict(contributions), other)
