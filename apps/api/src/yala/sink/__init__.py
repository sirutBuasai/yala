"""The write path: turning a reviewed change into directives appended or rewritten in the ledger.

One class composed from several, split by *what* is written, each over the shared file machinery in
:mod:`yala.sink.writer`. Every write re-loads the ledger strictly and a broken result restores every
file it touched before re-raising, so a bad write never leaves a corrupt ledger on disk.
"""

from __future__ import annotations

import datetime as dt
from abc import ABC, abstractmethod
from decimal import Decimal

from yala.sink.accounts import SETTINGS_FILE, AccountWrites
from yala.sink.balances import BalanceWrites
from yala.sink.paychecks import PaycheckWrites
from yala.sink.spending import SpendingWrites
from yala.sink.transfers import TransferWrites
from yala.sink.types import ContributionLeg, Credit, DeductionLeg
from yala.sink.writer import LedgerWriter

__all__ = [
    "SETTINGS_FILE",
    "ContributionLeg",
    "Credit",
    "DeductionLeg",
    "FileLedgerSink",
    "LedgerSink",
]


class LedgerSink(ABC):
    """Interface for writing reviewed entries back to the ledger."""

    @abstractmethod
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
        """Append one spending directive (one Expenses category, credits, one funding account)."""

    @abstractmethod
    def update_transaction(self, locator: str, **new_state) -> str:
        """Replace an existing spending directive in place, preserving/assigning its id."""

    @abstractmethod
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
        """Append one paycheck directive (Income − gross, deductions, contributions, deposit)."""

    @abstractmethod
    def update_paycheck(self, locator: str, **new_state) -> str:
        """Replace an existing paycheck directive in place, preserving/assigning its id."""

    @abstractmethod
    def append_transfer(
        self,
        date: dt.date,
        from_account: str,
        to_account: str,
        amount: Decimal,
        payee: str = "payment",
        pending: bool = False,
    ) -> str:
        """Append one transfer directive (from_account − amount, to_account + amount)."""

    @abstractmethod
    def update_transfer(self, locator: str, **new_state) -> str:
        """Replace an existing transfer directive in place, preserving/assigning its id."""

    @abstractmethod
    def delete_entry(self, locator: str) -> None:
        """Remove any located directive (spending, paycheck, or transfer) from its source file."""


class FileLedgerSink(
    SpendingWrites,
    PaycheckWrites,
    TransferWrites,
    # Before AccountWrites, which BalanceWrites derives from: a base has to follow what derives
    # from it, or there is no consistent MRO.
    BalanceWrites,
    AccountWrites,
    LedgerWriter,
    LedgerSink,
):
    """File writes to the dated entry files and the balance files."""
