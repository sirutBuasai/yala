"""Where a directive goes, and how it gets there safely.

The machinery every write shares: which file a directive belongs in and which line of it
(:mod:`yala.ledger.placement`), how a year file and its include are created, how an existing entry
is located and replaced, and the validated commit that rolls back if the result doesn't load.
Nothing here knows what is being written.
"""

from __future__ import annotations

import datetime as dt
import uuid
from collections.abc import Callable, Mapping
from pathlib import Path
from typing import NamedTuple

from beancount.core import data
from beancount.parser import printer

from yala import config
from yala.ledger import Ledger, directives, files, placement
from yala.ledger.constants import DROPPED_META
from yala.ledger.locators import find_entry, source_file, source_of
from yala.ledger.paths import parent
from yala.ledger.rewrite import block_end


class Carried(NamedTuple):
    """What an update keeps from the entry it replaces: the entry itself, the metadata the app does
    not manage, and the date the update resolved to (its own, or the entry's)."""

    entry: data.Transaction
    meta: dict
    date: dt.date


#: Builds one entry. Given the id to stamp and, on an update, what the replaced entry carried
#: forward; ``None`` on an append, where there is nothing to carry.
EntryBuilder = Callable[[str, "Carried | None"], data.Transaction]


def flag_for(pending: bool) -> str:
    """A transaction's beancount flag. Pending means unreconciled, not incomplete."""
    return "!" if pending else "*"


class LedgerWriter:
    """File-level write machinery, mixed into :class:`~yala.sink.FileLedgerSink`."""

    def __init__(self, ledger_dir: Path | None = None):
        self.ledger_dir = Path(ledger_dir) if ledger_dir else config.LEDGER_DIR
        self.main_ledger = self.ledger_dir / "main.beancount"

    def _assert_accounts_active(self, date: dt.date, accounts: list[str]) -> None:
        """Verify every account is active on ``date`` before writing, for a clean error message."""
        opened, closed = Ledger(self.main_ledger).load().open_close_dates()

        for account in dict.fromkeys(accounts):  # de-dupe, preserve order
            open_date = opened.get(account)

            if open_date is None:
                raise ValueError(f"unable to insert transaction: {account} does not exist")

            if open_date > date:
                raise ValueError(
                    f"unable to insert transaction: {account} is not open as of date "
                    f"{date.isoformat()} (opened {open_date.isoformat()})"
                )

            close_date = closed.get(account)
            if close_date is not None and close_date <= date:
                raise ValueError(
                    f"unable to insert transaction: {account} is closed as of date "
                    f"{date.isoformat()} (closed {close_date.isoformat()})"
                )

    def _entries(self) -> list[data.Directive]:
        """Every directive currently in the ledger — the anchors a placement is measured against.

        Read leniently: the include for a file about to be created is already wired, and a placement
        is only ever a choice of line. The commit's strict reload is what judges the result.
        """
        return Ledger(self.main_ledger, strict=False).load().entries

    def _account_file(self, account: str, entries: list[data.Directive]) -> Path:
        """The ``.beancount`` file a directive for ``account`` belongs in, so it lands beside its
        siblings however the ledger splits its account files.

        An existing ``open`` for the same account wins (a close goes in the file that declared it);
        otherwise the file most of the account's same-parent siblings live in; failing that, the
        top-level ``accounts.beancount``.
        """
        opens = [e for e in entries if isinstance(e, data.Open)]

        for e in opens:
            if e.account == account and (path := source_file(e)):
                return path

        siblings = parent(account)
        counts: dict[Path, int] = {}
        for e in opens:
            if parent(e.account) == siblings and (path := source_file(e)):
                counts[path] = counts.get(path, 0) + 1

        if counts:
            return max(counts, key=lambda p: counts[p])

        return self.ledger_dir / "accounts.beancount"

    @staticmethod
    def _lines(path: Path) -> list[str]:
        return path.read_text().splitlines(keepends=True) if path.exists() else []

    def _insert_dated(
        self,
        path: Path,
        block: str,
        date: dt.date,
        keep: Callable[[data.Directive], bool],
        *,
        spaced: bool,
        entries: list[data.Directive] | None = None,
    ) -> None:
        """Write one dated ``block`` into ``path``, in date order among the directives ``keep``
        accepts. With none to sit beside it goes at the end of the file, blank-line separated from
        whatever group is above it.
        """
        entries = self._entries() if entries is None else entries
        lines = self._lines(path)
        anchors = placement.spans(entries, path, lines, keep)
        at = placement.insert_at(lines, anchors, date, spaced=spaced)

        self._commit(path, placement.splice(lines, at, block, spaced=spaced or not anchors))

    def _insert_account_directive(
        self, account: str, directive: str, date: dt.date, kind: type[data.Directive]
    ) -> None:
        """Write an ``open`` or a ``close`` into the group that already holds the account's
        siblings — the file's other directives of the same kind, closest first: those naming a
        sibling under the same parent, else any of that kind.
        """
        entries = self._entries()
        path = self._account_file(account, entries)
        siblings = parent(account)

        # Only the fallback file can be missing (an existing open's file is on disk by definition),
        # and a declaration main doesn't include is a declaration the ledger cannot see.
        if not path.exists():
            self._ensure_main_include(f'include "{path.name}"')

        def same_kind(entry: data.Directive) -> bool:
            return isinstance(entry, kind)

        def same_parent(entry: data.Directive) -> bool:
            return same_kind(entry) and parent(entry.account) == siblings

        grouped = bool(placement.spans(entries, path, self._lines(path), same_parent))

        self._insert_dated(
            path,
            directive,
            date,
            same_parent if grouped else same_kind,
            spaced=False,
            entries=entries,
        )

    def _locate_for_update(
        self, locator: str, date: dt.date | None
    ) -> tuple[data.Transaction, str, dict, dt.date]:
        """Resolve ``locator`` to ``(entry, id, meta to carry forward, resolved date)``. The id is
        assigned if the entry lacked one; the date falls back to the entry's own."""
        entry = find_entry(Ledger(self.main_ledger, strict=True).load().entries, locator)
        entry_id = (entry.meta or {}).get("id") or str(uuid.uuid4())
        carried = {
            k: v
            for k, v in (entry.meta or {}).items()
            if k not in DROPPED_META and not k.startswith("__")
        }
        return entry, entry_id, carried, (date or entry.date)

    def _entry_span(
        self, entry: data.Transaction, locator: str
    ) -> tuple[Path, str, list[str], int, int]:
        """Locate an entry's source block: ``(path, original_text, lines, begin, end)``.

        Raises on a stale locator: the ``begin`` line must still be the entry's ``<date> <flag>``
        header, or the rewrite would clobber a different entry."""
        path, start = source_of(entry)

        original = path.read_text()
        lines = original.splitlines(keepends=True)
        begin = start - 1

        header = lines[begin] if 0 <= begin < len(lines) else ""
        if not header.startswith(f"{entry.date.isoformat()} {entry.flag}"):
            raise ValueError(
                f"stale locator {locator!r}: line {start} of {path.name} is not the resolved "
                f"{entry.date.isoformat()} {entry.flag} entry"
            )

        return path, original, lines, begin, block_end(lines, begin)

    def _insert_entry(self, subdir: str, entry: data.Transaction) -> None:
        self._insert(subdir, entry.date, printer.format_entry(entry))

    def append_built(self, subdir: str, build: EntryBuilder) -> str:
        """Write a new entry into ``subdir`` and return the id it was stamped with.

        ``build`` receives the id and the entry's date, so the three kinds of entry differ only in
        the postings they assemble, never in how one is filed.
        """
        entry_id = str(uuid.uuid4())
        self._insert_entry(subdir, build(entry_id, None))

        return entry_id

    def update_built(
        self, subdir: str, locator: str, date: dt.date | None, build: EntryBuilder
    ) -> str:
        """Replace the entry at ``locator`` with a freshly built one, re-placed if its date moved.

        The located entry is handed to ``build`` so the rebuild can carry forward what the request
        does not resend — the narration, tags, links and any metadata the app does not manage.
        """
        entry, entry_id, carried, resolved_date = self._locate_for_update(locator, date)
        rebuilt = build(entry_id, Carried(entry, carried, resolved_date))

        self._replace_located(entry, resolved_date, printer.format_entry(rebuilt), subdir, locator)

        return entry_id

    def _insert(self, subdir: str, date: dt.date, block: str) -> None:
        """Write one dated block into ``<subdir>/<year>.beancount``, creating the year file and its
        include when the year is new, and rolling every touched file back if the result won't load.
        """
        year_file = self.ledger_dir / subdir / f"{date.year}.beancount"
        include_line = f'include "{subdir}/{date.year}.beancount"'
        agg_file = self.ledger_dir / f"{subdir}.beancount"

        year_before = year_file.read_text() if year_file.exists() else None
        main_before = self.main_ledger.read_text() if self.main_ledger.exists() else None
        agg_before = agg_file.read_text() if agg_file.exists() else None

        try:
            year_file.parent.mkdir(parents=True, exist_ok=True)

            if year_before is None:
                header = directives.year_header(subdir, date.year)
                files.atomic_write(year_file, f"{header}\n" if header else "")
                self._ensure_include(subdir, include_line)

            files.atomic_write(year_file, self._placed(subdir, year_file, date, block))

            Ledger(self.main_ledger, strict=True).load()

        except Exception:
            if year_before is None:
                year_file.unlink(missing_ok=True)

            else:
                files.atomic_write(year_file, year_before)

            files.restore(agg_file, agg_before)
            files.restore(self.main_ledger, main_before)

            raise

    def _placed(self, subdir: str, path: Path, date: dt.date, block: str) -> str:
        """``path``'s text with ``block`` in date order, under its month's heading where the file is
        sectioned that way."""
        lines = self._lines(path)
        anchors = placement.spans(self._entries(), path, lines)

        if subdir in directives.MONTHLY:
            at, header = placement.section_slot(lines, anchors, date)

            if header:
                block = f"{header}\n{block}"

        else:
            at = placement.insert_at(lines, anchors, date, spaced=True)

        return placement.splice(lines, at, block, spaced=True)

    def _commit(self, path: Path, content: str) -> None:
        files.commit(self.main_ledger, {path: content})

    def rewrite_files(self, changes: Mapping[Path, str]) -> None:
        """Apply a planned multi-file rewrite (see :mod:`yala.ledger.rewrite`) as one unit."""
        if changes:
            files.commit(self.main_ledger, changes)

    def _replace_located(
        self, entry: data.Transaction, resolved_date: dt.date, block: str, subdir: str, locator: str
    ) -> None:
        """Swap ``entry``'s source block for ``block``, re-placing it when ``resolved_date`` moves
        it: to ``<subdir>/<year>.beancount`` for another year, or to its new position in date order
        within its own file.
        """
        path, original, lines, begin, end = self._entry_span(entry, locator)

        if resolved_date.year != entry.date.year:
            kept, _ = placement.cut(lines, begin, end)
            files.atomic_write(path, "".join(kept))  # drop from the old file

            try:
                self._insert(subdir, resolved_date, block)

            except Exception:
                files.atomic_write(path, original)  # restore old file; _insert rolled back its own
                raise

            return

        if resolved_date == entry.date:
            rewritten = lines[:begin] + block.splitlines(keepends=True) + lines[end:]
            self._commit(path, "".join(rewritten))
            return

        anchors = placement.spans(self._entries(), path, lines)
        kept, removed = placement.cut(lines, begin, end)
        at = placement.insert_at(
            kept, placement.without(anchors, begin, removed), resolved_date, spaced=True
        )

        self._commit(path, placement.splice(kept, at, block, spaced=True))

    def _ensure_include(self, subdir: str, include_line: str) -> None:
        """Register a new year file's include in the ``{subdir}.beancount`` aggregator, so a new
        year joins the same load path as the existing ones rather than being scattered into main.
        Wires the aggregator into main too, for a fresh ledger."""
        self._ensure_main_include(f'include "{subdir}.beancount"')
        self._add_include(self.ledger_dir / f"{subdir}.beancount", include_line)

    def _ensure_main_include(self, include_line: str) -> None:
        self._add_include(self.main_ledger, include_line)

    def _add_include(self, path: Path, include_line: str) -> None:
        """Add ``include_line`` to ``path`` in sorted position among the includes it already has, so
        the list stays ordered however many years or files are added to it."""
        text = path.read_text() if path.exists() else ""

        if include_line in text:
            return

        lines = text.splitlines(keepends=True)
        at = placement.include_at(lines, include_line)

        files.atomic_write(path, placement.splice(lines, at, include_line, spaced=False))

    def delete_entry(self, locator: str) -> None:
        entry = find_entry(
            Ledger(self.main_ledger, strict=True).load().entries, locator
        )  # raises KeyError if unknown

        path, original, lines, begin, end = self._entry_span(entry, locator)
        kept, _ = placement.cut(lines, begin, end)

        self._commit(path, "".join(kept))
