"""Account directives, plus settings, which are written the same way: appended, dated,
superseding."""

from __future__ import annotations

import datetime as dt
from collections.abc import Mapping
from decimal import Decimal
from pathlib import Path

from beancount.core import data

from yala.ledger import Ledger, directives, rewrite
from yala.ledger.accounts import open_entry
from yala.ledger.constants import BALANCE, CLOSE, DEFAULT_CURRENCY, OPEN
from yala.ledger.locators import source_of
from yala.ledger.settings import SETTING_TYPE, SETTINGS_BY_KEY, coerce, format_value
from yala.sink.writer import LedgerWriter

#: Settings-directive file, relative to the ledger dir.
SETTINGS_FILE = "settings.beancount"


class AccountWrites(LedgerWriter):
    """Account and settings directives, mixed into :class:`~yala.sink.FileLedgerSink`."""

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
        """Set or remove several meta keys on one account's ``open`` directive at once."""
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

    def set_setting(
        self, key: str, value: object | None, date: dt.date | None = None
    ) -> Decimal | None:
        """Rewrites a directive already dated ``date``, else appends, so changes supersede. ``None``
        puts the setting back on its default. Raises ``KeyError`` or ``ValueError``."""
        spec = SETTINGS_BY_KEY.get(key)
        if spec is None:
            raise KeyError(key)

        stored = None if value is None else coerce(key, value)
        on = date or dt.date.today()
        directive = f'{on} custom "{SETTING_TYPE}" "{key}" {format_value(spec, stored)}'

        existing = [
            e
            for e in Ledger(self.main_ledger, strict=True).load().entries
            if isinstance(e, data.Custom)
            and e.type == SETTING_TYPE
            and e.date == on
            and [v.value for v in (e.values or [])][:1] == [key]
        ]

        if existing:
            path, lineno = source_of(existing[-1])
            lines = path.read_text().splitlines(keepends=True)
            at = lineno - 1
            lines[at] = f"{directive}\n"
            self._commit(path, "".join(lines))
        else:
            self._ensure_main_include(f'include "{SETTINGS_FILE}"')
            self._insert_dated(
                self.ledger_dir / SETTINGS_FILE,
                directive,
                on,
                lambda e: isinstance(e, data.Custom) and e.type == SETTING_TYPE,
                spaced=True,
            )

        return stored
