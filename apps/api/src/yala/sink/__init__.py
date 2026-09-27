"""The write path, one class composed by what is written over :mod:`yala.sink.writer`. A write that
fails a strict reload restores every file it touched."""

from __future__ import annotations

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
]


class FileLedgerSink(
    SpendingWrites,
    PaycheckWrites,
    TransferWrites,
    # Before AccountWrites, which BalanceWrites derives from: a base has to follow what derives
    # from it, or there is no consistent MRO.
    BalanceWrites,
    AccountWrites,
    LedgerWriter,
):
    """File writes to the dated entry files and the balance files."""
