"""Account directives: opening, closing, asserting and their metadata."""

from __future__ import annotations

import datetime as dt
from collections.abc import Mapping
from pathlib import Path

from beancount.core import data

from yala.ledger import Ledger, directives, rewrite
from yala.ledger.accounts import open_entry
from yala.ledger.constants import BALANCE, CLOSE, DEFAULT_CURRENCY, OPEN
from yala.ledger.locators import source_of
from yala.sink.writer import LedgerWriter


class AccountWrites(LedgerWriter):
    def open_account(
        self,
        account: str,
        date: dt.date | None = None,
        *,
        currency: str | None = DEFAULT_CURRENCY,
        meta: dict[str, str] | None = None,
    ) -> None:
        """Write an ``open`` directive; ``currency=None`` lets the account hold any ticker."""
        date = date or dt.date.today()
        header = f"{date.isoformat()} {OPEN} {account}" + (f" {currency}" if currency else "")
        self._insert_account_directive(
            account, header + directives.meta_lines(meta), date, data.Open
        )

    def assert_balance(
        self,
        account: str,
        amount: str,
        currency: str = DEFAULT_CURRENCY,
        date: dt.date | None = None,
    ) -> None:
        """Filed with the other snapshots, not beside the ``open`` that prompted it."""
        date = date or dt.date.today()
        self._insert(
            directives.balance_subdir(account),
            date,
            f"{date.isoformat()} {BALANCE} {account} {amount} {currency}",
        )

    def close_account(
        self, account: str, date: dt.date | None = None, *, meta: dict[str, str] | None = None
    ) -> None:
        """Write a ``close``; the strict reload rejects an unopened or already-closed account."""
        date = date or dt.date.today()
        self._insert_account_directive(
            account,
            f"{date.isoformat()} {CLOSE} {account}{directives.meta_lines(meta)}",
            date,
            data.Close,
        )

    def set_account_meta(self, account: str, key: str, value: str | None) -> None:
        """Set (or, when ``value`` is None, remove) one string meta key on an account's ``open``."""
        self.set_account_metas(account, {key: value})

    def set_account_metas(self, account: str, values: Mapping[str, str | None]) -> None:
        self.set_metas({account: values})

    def set_metas(self, edits: Mapping[str, Mapping[str, str | None]]) -> None:
        """One commit for the set, ``None`` removing a key, so a rejected institution cascade never
        half-applies. Raises ``KeyError`` for an unknown account."""
        wanted = {account: values for account, values in edits.items() if values}
        if not wanted:
            return

        ledger = Ledger(self.main_ledger, strict=True).load()
        located: dict[Path, list[tuple[int, Mapping[str, str | None]]]] = {}

        for account, values in wanted.items():
            opened = open_entry(ledger, account)
            if opened is None:
                raise KeyError(account)

            path, lineno = source_of(opened)
            located.setdefault(path, []).append((lineno, values))

        changes: dict[Path, str] = {}
        for path, blocks in located.items():
            text = path.read_text()
            # Bottom-up: an earlier directive's line number is still valid once a later one has been
            # rewritten to a different number of lines.
            for lineno, values in sorted(blocks, reverse=True):
                text = rewrite.set_meta_block(text, lineno, values)
            changes[path] = text

        self.rewrite_files(changes)
