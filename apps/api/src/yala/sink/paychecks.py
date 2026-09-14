"""Writing a paycheck: gross in, deductions and contributions out, the rest deposited.

A contribution's label is stamped as a ``label`` posting-meta rather than split into its own
account, so the money stays in one holding while income can still break the split out.
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal

from beancount.core import data

from yala.ledger import directives
from yala.ledger.constants import LABEL_META
from yala.money import round_cents
from yala.sink.types import ContributionLeg, DeductionLeg
from yala.sink.writer import Carried


class PaycheckWrites:
    """Paycheck writes, mixed into :class:`~yala.sink.FileLedgerSink`."""

    def _paycheck_entry(
        self,
        *,
        date: dt.date,
        gross: Decimal,
        income_account: str,
        deduction_legs: list[DeductionLeg],
        contribution_legs: list[ContributionLeg],
        deposit_account: str,
        entry_id: str,
        payee: str,
        carried: Carried | None,
    ) -> data.Transaction:
        """Build a balanced paycheck ``Transaction``; raises if the legs exceed ``gross``."""
        gross = round_cents(gross)
        deductions = [(a, round_cents(Decimal(v))) for a, v in deduction_legs]
        contributions = [(a, s, round_cents(Decimal(v))) for a, s, v in contribution_legs]

        self._assert_accounts_active(
            date,
            [
                income_account,
                deposit_account,
                *(a for a, _ in deductions),
                *(a for a, _, _ in contributions),
            ],
        )

        out = sum((v for _, v in deductions), Decimal(0)) + sum(
            (v for _, _, v in contributions), Decimal(0)
        )
        take_home = gross - out
        if take_home < 0:
            raise ValueError(
                f"deductions and contributions exceed gross (take-home would be {take_home})"
            )

        postings = [directives.posting(income_account, -gross)]
        postings += [directives.posting(account, amt) for account, amt in deductions]
        postings += [
            directives.posting(account, amt, {LABEL_META: label} if label else None)
            for account, label, amt in contributions
        ]
        postings.append(directives.posting(deposit_account, take_home))

        previous = carried.entry if carried else None

        return data.Transaction(
            {"id": entry_id} | (carried.meta if carried else {}),
            date,
            "*",
            payee,
            previous.narration if previous else None,
            frozenset(previous.tags or () if previous else ()),
            frozenset(previous.links or () if previous else ()),
            postings,
        )

    def append_paycheck(
        self,
        date: dt.date,
        gross: Decimal,
        income_account: str,
        deduction_legs: list[DeductionLeg],
        contribution_legs: list[ContributionLeg],
        deposit_account: str,
        payee: str = "paycheck",
    ) -> str:
        return self.append_built(
            "income",
            lambda entry_id, carried: self._paycheck_entry(
                date=date,
                gross=gross,
                income_account=income_account,
                deduction_legs=deduction_legs,
                contribution_legs=contribution_legs,
                deposit_account=deposit_account,
                entry_id=entry_id,
                payee=payee,
                carried=carried,
            ),
        )

    def update_paycheck(
        self,
        locator: str,
        *,
        gross: Decimal,
        income_account: str,
        deduction_legs: list[DeductionLeg],
        contribution_legs: list[ContributionLeg],
        deposit_account: str,
        date: dt.date | None = None,
        payee: str = "paycheck",
    ) -> str:
        return self.update_built(
            "income",
            locator,
            date,
            lambda entry_id, carried: self._paycheck_entry(
                date=carried.date,
                gross=Decimal(gross),
                income_account=income_account,
                deduction_legs=deduction_legs,
                contribution_legs=contribution_legs,
                deposit_account=deposit_account,
                entry_id=entry_id,
                payee=payee,
                carried=carried,
            ),
        )
