"""Writing a spending transaction: one ``Expenses:*`` category, any reimbursements, one funder.

The single ``Expenses`` posting carries the *net* share, so a split bill counts what you paid rather
than what was billed; the pre-reimbursement total is kept as a ``bill`` meta.
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal

from beancount.core import data
from beancount.core.amount import Amount

from yala.ledger import directives
from yala.ledger.constants import DEFAULT_CURRENCY, EXPENSES
from yala.money import round_cents
from yala.sink.types import Credit
from yala.sink.writer import Carried, flag_for


class SpendingWrites:
    """Spending writes, mixed into :class:`~yala.sink.FileLedgerSink`."""

    def _spending_entry(
        self,
        *,
        date: dt.date,
        payee: str,
        category: str,
        amount: Decimal,
        funding_account: str,
        entry_id: str,
        pending: bool,
        credits: list[Credit] | None,
        carried: Carried | None,
    ) -> data.Transaction:
        legs = [(a, round_cents(Decimal(amt))) for a, amt in (credits or [])]
        self._assert_accounts_active(
            date, [f"{EXPENSES}{category}", funding_account, *(a for a, _ in legs)]
        )

        total = round_cents(amount)
        credit_postings = [directives.posting(account, amt) for account, amt in legs]
        net_expense = total - sum((amt for _, amt in legs), Decimal(0))

        meta: dict = {"id": entry_id, "funding": funding_account}
        if credit_postings:
            meta["bill"] = Amount(total, DEFAULT_CURRENCY)
        meta |= carried.meta if carried else {}

        postings = [
            directives.posting(f"{EXPENSES}{category}", net_expense),
            *credit_postings,
            directives.posting(funding_account, -total),
        ]

        previous = carried.entry if carried else None
        # An update drops a narration that merely repeated the payee, which is how a migrated entry
        # stops carrying its title twice.
        narration = (
            previous.narration
            if previous and previous.narration and previous.narration != payee
            else None
        )

        return data.Transaction(
            meta,
            date,
            flag_for(pending),
            payee,
            narration,
            frozenset(previous.tags or () if previous else ()),
            frozenset(previous.links or () if previous else ()),
            postings,
        )

    def append_transaction(
        self,
        date: dt.date,
        payee: str,
        amount: Decimal,
        category: str,
        funding_account: str,
        pending: bool = False,
        credits: list[Credit] | None = None,
    ) -> str:
        return self.append_built(
            "spending",
            lambda entry_id, carried: self._spending_entry(
                date=date,
                payee=payee,
                category=category,
                amount=Decimal(amount),
                funding_account=funding_account,
                entry_id=entry_id,
                pending=pending,
                credits=credits,
                carried=carried,
            ),
        )

    def update_transaction(
        self,
        locator: str,
        *,
        payee: str,
        amount: Decimal,
        category: str,
        funding_account: str,
        date: dt.date | None = None,
        pending: bool = False,
        credits: list[Credit] | None = None,
    ) -> str:
        return self.update_built(
            "spending",
            locator,
            date,
            lambda entry_id, carried: self._spending_entry(
                date=carried.date,
                payee=payee,
                category=category,
                amount=Decimal(amount),
                funding_account=funding_account,
                entry_id=entry_id,
                pending=pending,
                credits=credits,
                carried=carried,
            ),
        )
