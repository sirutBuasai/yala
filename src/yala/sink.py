"""The write abstraction for edit-mode writes back to the ledger.

Writes never scatter file I/O across the API. They go through a :class:`LedgerSink`.

Every write re-loads the ledger strictly; if the result is broken the touched file is rolled back
to its prior state and the error re-raised, so a bad write never leaves a corrupt ledger on disk.
"""

from __future__ import annotations

import datetime as dt
import os
import tempfile
import uuid
from abc import ABC, abstractmethod
from decimal import Decimal
from pathlib import Path

from beancount.core import data
from beancount.core.amount import Amount
from beancount.parser import printer

from yala import config
from yala.ledger import Ledger
from yala.money import round_cents

Credit = tuple[str, Decimal]

_INTERNAL_META = {"filename", "lineno"}  # beancount-injected source location
_RETIRED_META = {"src"}  # spreadsheet-import artifact, dropped on edit
_MANAGED_META = {"id", "funding", "bill"}  # we always (re)compute these


def _round_cents(value: Decimal) -> Decimal:
    """Quantize to 2 decimal places (cents) — banker's rounding via :mod:`yala.money`."""
    return round_cents(value)


def _posting(account: str, number: Decimal) -> data.Posting:
    """A single USD posting with no cost/price/flag/meta."""
    return data.Posting(account, Amount(number, "USD"), None, None, None, None)


def _atomic_write(path: Path, content: str) -> None:
    """Write ``content`` to ``path`` atomically: temp file in the same dir, fsync, then rename."""
    fd, tmp = tempfile.mkstemp(dir=str(path.parent), prefix=".yala-", suffix=path.suffix)
    try:
        with os.fdopen(fd, "w") as f:
            f.write(content)
            f.flush()
            os.fsync(f.fileno())

        os.replace(tmp, path)

    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


def find_transaction(entries: list, locator: str) -> data.Transaction:
    """Resolve a locator (``id:<uuid>`` or ``line:<path>:<lineno>``) to a beancount transaction."""
    kind, _, rest = locator.partition(":")
    txns = [e for e in entries if isinstance(e, data.Transaction)]

    if kind == "id":
        for e in txns:
            if (e.meta or {}).get("id") == rest:
                return e

    elif kind == "line":
        path, _, lineno = rest.rpartition(":")
        for e in txns:
            if e.meta.get("filename") == path and e.meta.get("lineno") == int(lineno):
                return e

    raise KeyError(f"no transaction found for locator {locator!r}")


def entry_locator(entry: data.Transaction) -> str:
    """Stable handle for an entry: id-form if it carries an id, else line-form."""
    uid = (entry.meta or {}).get("id")

    if uid:
        return f"id:{uid}"

    return f"line:{entry.meta['filename']}:{entry.meta['lineno']}"


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
    def append_paycheck(
        self,
        date: dt.date,
        gross: Decimal,
        deductions: dict[str, Decimal],
        contributions: dict[str, Decimal],
        deposit_account: str,
        payee: str = "paycheck",
    ) -> str:
        """Append one paycheck directive (Income − gross, deductions, contributions, deposit)."""

    @abstractmethod
    def update_transaction(self, locator: str, **new_state) -> str:
        """Replace an existing spending directive in place, preserving/assigning its id."""

    @abstractmethod
    def delete_transaction(self, locator: str) -> None:
        """Remove the located directive (spending or paycheck) from its source file."""


class FileLedgerSink(LedgerSink):
    """File writes to the dated ``spending/`` and ``income/`` beancount files."""

    def __init__(self, ledger_dir: Path | None = None):
        self.ledger_dir = Path(ledger_dir) if ledger_dir else config.LEDGER_DIR
        self.main_ledger = self.ledger_dir / "main.beancount"

    # --- pre-write validation ---

    def _assert_accounts_active(self, date: dt.date, accounts: list[str]) -> None:
        """Verify every account is active on ``date`` before writing, for a clean error message."""
        opened: dict[str, dt.date] = {}
        closed: dict[str, dt.date] = {}

        for e in Ledger(self.main_ledger).load().entries:
            if isinstance(e, data.Open):
                opened[e.account] = min(e.date, opened.get(e.account, e.date))

            elif isinstance(e, data.Close):
                closed[e.account] = min(e.date, closed.get(e.account, e.date))

        for account in dict.fromkeys(accounts):  # de-dupe, preserve order
            open_date = opened.get(account)

            if open_date is None:
                raise ValueError(f"Unable to insert transaction: {account} does not exist.")

            if open_date > date:
                raise ValueError(
                    f"Unable to insert transaction: {account} is not open as of date "
                    f"{date.isoformat()} (opened {open_date.isoformat()})."
                )

            close_date = closed.get(account)
            if close_date is not None and close_date <= date:
                raise ValueError(
                    f"Unable to insert transaction: {account} is closed as of date "
                    f"{date.isoformat()} (closed {close_date.isoformat()})."
                )

    # --- shared builder (add + update) ---

    def _spending_entry(
        self,
        *,
        date: dt.date,
        flag: str,
        payee: str,
        category: str,
        amount: Decimal,
        funding_account: str,
        entry_id: str,
        credits: list[Credit] | None = None,
        narration: str | None = None,
        tags=(),
        links=(),
        extra_meta: dict | None = None,
    ) -> data.Transaction:
        """Build a balanced beancount ``Transaction`` for a spending directive."""
        meta: dict = {"id": entry_id, "funding": funding_account}

        total = _round_cents(amount)
        credit_postings = []
        credit_sum = Decimal(0)

        for account, amt in credits or []:
            qamt = _round_cents(amt)
            credit_postings.append(_posting(account, qamt))
            credit_sum += qamt

        net_expense = total - credit_sum

        if credit_postings:
            meta["bill"] = Amount(total, "USD")

        if extra_meta:
            meta.update(extra_meta)

        postings = [_posting(f"Expenses:{category}", net_expense), *credit_postings]
        postings.append(_posting(funding_account, -total))

        return data.Transaction(
            meta, date, flag, payee, narration, frozenset(tags), frozenset(links), postings
        )

    # --- writes ---

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
        credit_legs = [(a, Decimal(amt)) for a, amt in (credits or [])]

        self._assert_accounts_active(
            date, [f"Expenses:{category}", funding_account, *(a for a, _ in credit_legs)]
        )

        entry_id = str(uuid.uuid4())
        entry = self._spending_entry(
            date=date,
            flag="!" if pending else "*",
            payee=payee,
            category=category,
            amount=Decimal(amount),
            funding_account=funding_account,
            entry_id=entry_id,
            credits=credit_legs,
        )
        block = printer.format_entry(entry)

        self._append("spending", date.year, f"; Spending transactions for {date.year}", block)

        return entry_id

    def append_paycheck(
        self,
        date: dt.date,
        gross: Decimal,
        deductions: dict[str, Decimal],
        contributions: dict[str, Decimal],
        deposit_account: str,
        payee: str = "paycheck",
    ) -> str:
        gross = _round_cents(gross)
        deductions = {k: _round_cents(v) for k, v in deductions.items()}
        contributions = {k: _round_cents(v) for k, v in contributions.items()}

        self._assert_accounts_active(
            date,
            [
                "Income:Salary",
                deposit_account,
                *(f"Expenses:Deductions:{name}" for name in deductions),
                *(f"Assets:Investments:{name}" for name in contributions),
            ],
        )

        take_home = (
            gross - sum(deductions.values(), Decimal(0)) - sum(contributions.values(), Decimal(0))
        )

        if take_home < 0:
            raise ValueError(
                f"deductions and contributions exceed gross (take-home would be {take_home})"
            )

        legs: list[tuple[str, Decimal]] = [("Income:Salary", -gross)]

        for name, amt in deductions.items():
            legs.append((f"Expenses:Deductions:{name}", amt))

        for name, amt in contributions.items():
            legs.append((f"Assets:Investments:{name}", amt))

        legs.append((deposit_account, take_home))

        total = sum((amt for _, amt in legs), Decimal(0))
        if total != 0:
            raise ValueError(f"paycheck legs do not sum to zero (off by {total})")

        entry_id = str(uuid.uuid4())
        entry = data.Transaction(
            {"id": entry_id},
            date,
            "*",
            payee,
            None,
            frozenset(),
            frozenset(),
            [_posting(account, amt) for account, amt in legs],
        )
        block = printer.format_entry(entry)

        self._append("income", date.year, f"; Income for {date.year}", block)

        return entry_id

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
        """Replace the located transaction in place; assign an id if it lacked one."""
        led = Ledger(self.main_ledger, strict=True).load()
        entry = find_transaction(led.entries, locator)

        path = Path(entry.meta["filename"])
        start = int(entry.meta["lineno"])
        entry_id = (entry.meta or {}).get("id") or str(uuid.uuid4())

        carried = {
            k: v
            for k, v in (entry.meta or {}).items()
            if k not in _INTERNAL_META | _RETIRED_META | _MANAGED_META and not k.startswith("__")
        }
        resolved_date = date or entry.date
        credit_legs = [(a, Decimal(amt)) for a, amt in (credits or [])]

        self._assert_accounts_active(
            resolved_date, [f"Expenses:{category}", funding_account, *(a for a, _ in credit_legs)]
        )
        new_entry = self._spending_entry(
            date=resolved_date,
            flag="!" if pending else "*",
            payee=payee,
            category=category,
            amount=Decimal(amount),
            funding_account=funding_account,
            entry_id=entry_id,
            credits=credit_legs,
            narration=entry.narration,
            tags=entry.tags or (),
            links=entry.links or (),
            extra_meta=carried,
        )
        block = printer.format_entry(new_entry)

        original = path.read_text()
        lines = original.splitlines(keepends=True)
        begin = start - 1

        # Guard against a stale locator: the line we're about to replace must still be the
        # header of the resolved entry (matching its date + flag), or we'd clobber the wrong txn.
        header = lines[begin] if 0 <= begin < len(lines) else ""
        if not header.startswith(f"{entry.date.isoformat()} {entry.flag}"):
            raise ValueError(
                f"stale locator {locator!r}: line {start} of {path.name} is not the resolved "
                f"{entry.date.isoformat()} {entry.flag} entry"
            )

        end = begin + 1
        while end < len(lines) and lines[end].startswith((" ", "\t")) and lines[end].strip():
            end += 1  # consume the entry's indented meta + posting lines (blank line ends it)

        # A date edit that crosses into a different year must relocate the entry to that year's
        # file (spending/<year>.beancount), not leave it stranded in the original year's file.
        if resolved_date.year != entry.date.year:
            _atomic_write(path, "".join(lines[:begin] + lines[end:]))  # drop from the old file

            try:
                self._append(
                    "spending",
                    resolved_date.year,
                    f"; Spending transactions for {resolved_date.year}",
                    block,
                )

            except Exception:
                _atomic_write(path, original)  # restore the old file; _append rolled back its own
                raise

            return entry_id

        _atomic_write(path, "".join(lines[:begin] + block.splitlines(keepends=True) + lines[end:]))

        try:
            Ledger(self.main_ledger, strict=True).load()

        except Exception:
            _atomic_write(path, original)
            raise

        return entry_id

    def delete_transaction(self, locator: str) -> None:
        """Remove the located entry (spending or paycheck) from its file, then strict-reload."""
        led = Ledger(self.main_ledger, strict=True).load()
        entry = find_transaction(led.entries, locator)  # raises KeyError if unknown

        path = Path(entry.meta["filename"])
        start = int(entry.meta["lineno"])

        original = path.read_text()
        lines = original.splitlines(keepends=True)
        begin = start - 1

        header = lines[begin] if 0 <= begin < len(lines) else ""
        if not header.startswith(f"{entry.date.isoformat()} {entry.flag}"):
            raise ValueError(
                f"stale locator {locator!r}: line {start} of {path.name} is not the resolved "
                f"{entry.date.isoformat()} {entry.flag} entry"
            )

        end = begin + 1
        while end < len(lines) and lines[end].startswith((" ", "\t")) and lines[end].strip():
            end += 1  # consume the entry's indented meta + posting lines (blank line ends it)

        _atomic_write(path, "".join(lines[:begin] + lines[end:]))

        try:
            Ledger(self.main_ledger, strict=True).load()

        except Exception:
            _atomic_write(path, original)
            raise

    def open_account(self, account: str, date: dt.date | None = None) -> None:
        """Append an ``open`` directive to the accounts file (e.g. a new contribution type)."""
        date = date or dt.date.today()
        accounts_file = self.ledger_dir / "accounts.beancount"

        original = accounts_file.read_text()
        text = original if original.endswith("\n") else original + "\n"

        _atomic_write(accounts_file, f"{text}{date.isoformat()} open {account} USD\n")

        try:
            Ledger(self.main_ledger, strict=True).load()

        except Exception:
            _atomic_write(accounts_file, original)
            raise

    # --- internals ---

    def _append(self, subdir: str, year: int, header: str, block: str) -> None:
        year_file = self.ledger_dir / subdir / f"{year}.beancount"
        include_line = f'include "{subdir}/{year}.beancount"'

        year_before = year_file.read_text() if year_file.exists() else None
        main_before = self.main_ledger.read_text() if self.main_ledger.exists() else None

        try:
            year_file.parent.mkdir(parents=True, exist_ok=True)

            if year_before is None:
                _atomic_write(year_file, f"{header}\n")
                self._ensure_include(subdir, include_line)

            text = year_file.read_text()
            if text and not text.endswith("\n"):
                text += "\n"

            _atomic_write(year_file, f"{text}\n{block}")

            Ledger(self.main_ledger, strict=True).load()

        except Exception:
            if year_before is None:
                year_file.unlink(missing_ok=True)

            else:
                _atomic_write(year_file, year_before)

            if main_before is None:
                self.main_ledger.unlink(missing_ok=True)

            elif self.main_ledger.exists() and self.main_ledger.read_text() != main_before:
                _atomic_write(self.main_ledger, main_before)

            raise

    def _ensure_include(self, subdir: str, include_line: str) -> None:
        text = self.main_ledger.read_text() if self.main_ledger.exists() else ""
        if include_line in text:
            return

        lines = text.splitlines()
        prefix = f'include "{subdir}/'
        last = max((i for i, ln in enumerate(lines) if ln.startswith(prefix)), default=None)

        if last is None:
            lines.append(include_line)

        else:
            lines.insert(last + 1, include_line)

        _atomic_write(self.main_ledger, "\n".join(lines) + "\n")
