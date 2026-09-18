"""Writing a transfer: money moved between the owner's own accounts.

No ``Expenses`` or ``Income`` leg, which is what makes the read domains classify it as neither
spending nor income.
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal

from beancount.core import data

from yala.ledger import directives
from yala.money import round_cents
from yala.sink.writer import Carried, LedgerWriter, flag_for


class TransferWrites(LedgerWriter):
    """Transfer writes, mixed into :class:`~yala.sink.FileLedgerSink`."""

    def _transfer_entry(
        self,
        *,
        date: dt.date,
        payee: str,
        from_account: str,
        to_account: str,
        amount: Decimal,
        entry_id: str,
        pending: bool,
        carried: Carried | None,
    ) -> data.Transaction:
        amt = round_cents(amount)
        self._assert_accounts_active(date, [from_account, to_account])

        meta: dict = {"id": entry_id} | (carried.meta if carried else {})
        postings = [directives.posting(to_account, amt), directives.posting(from_account, -amt)]
        previous = carried.entry if carried else None

        return data.Transaction(
            meta,
            date,
            flag_for(pending),
            payee,
            previous.narration if previous else None,
            frozenset(previous.tags or () if previous else ()),
            frozenset(previous.links or () if previous else ()),
            postings,
        )

    def append_transfer(
        self,
        date: dt.date,
        from_account: str,
        to_account: str,
        amount: Decimal,
        payee: str = "payment",
        pending: bool = False,
    ) -> str:
        return self.append_built(
            "transfers",
            lambda entry_id, carried: self._transfer_entry(
                date=date,
                payee=payee,
                from_account=from_account,
                to_account=to_account,
                amount=Decimal(amount),
                entry_id=entry_id,
                pending=pending,
                carried=carried,
            ),
        )

    def update_transfer(
        self,
        locator: str,
        *,
        from_account: str,
        to_account: str,
        amount: Decimal,
        date: dt.date | None = None,
        payee: str = "payment",
        pending: bool = False,
    ) -> str:
        return self.update_built(
            "transfers",
            locator,
            date,
            lambda entry_id, carried: self._transfer_entry(
                date=carried.date,
                payee=payee,
                from_account=from_account,
                to_account=to_account,
                amount=Decimal(amount),
                entry_id=entry_id,
                pending=pending,
                carried=carried,
            ),
        )
