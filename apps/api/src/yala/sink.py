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
from yala.ledger.entities import DROPPED_META, locator_of
from yala.money import round_cents

Credit = tuple[str, Decimal]
DeductionLeg = tuple[str, Decimal]  # (account, amount)
ContributionLeg = tuple[str, str | None, Decimal]  # (account, label or None, amount)


def _posting(account: str, number: Decimal, meta: dict | None = None) -> data.Posting:
    """A single USD posting with no cost/price/flag; optional posting meta (e.g. ``label``)."""
    return data.Posting(
        account, Amount(number, "USD"), cost=None, price=None, flag=None, meta=meta or None
    )


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


def _resolve_ledger_path(path: str) -> str:
    """Canonical absolute path for a ``line:`` locator path (accepts relative or absolute), so a
    ledger-relative locator round-trips against beancount's ``filename`` meta even across symlinks
    (e.g. macOS /var vs /private/var)."""
    absolute = path if os.path.isabs(path) else os.path.join(config.LEDGER_DIR, path)
    return os.path.realpath(absolute)


def find_transaction(entries: list, locator: str) -> data.Transaction:
    """Resolve a locator (``id:<uuid>`` or ``line:<path>:<lineno>``) to a beancount transaction.

    ``line:`` paths are ledger-relative (see :func:`~yala.ledger.entities.locator_of`); legacy
    absolute paths still resolve too."""
    kind, _, rest = locator.partition(":")
    txns = [e for e in entries if isinstance(e, data.Transaction)]

    if kind == "id":
        for e in txns:
            if (e.meta or {}).get("id") == rest:
                return e

    elif kind == "line":
        path, _, lineno = rest.rpartition(":")
        target = _resolve_ledger_path(path)
        for e in txns:
            filename = e.meta.get("filename")
            if (
                filename is not None
                and os.path.realpath(filename) == target
                and e.meta.get("lineno") == int(lineno)
            ):
                return e

    raise KeyError(f"no transaction found for locator {locator!r}")


def entry_locator(entry: data.Transaction) -> str:
    """Stable handle for a raw beancount entry: id-form if it carries an id, else line-form."""
    return locator_of(entry.meta)


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
        income_account: str,
        deduction_legs: list[DeductionLeg],
        contribution_legs: list[ContributionLeg],
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

        total = round_cents(amount)
        credit_postings = []
        credit_sum = Decimal(0)

        for account, amt in credits or []:
            qamt = round_cents(amt)
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
        payee: str = "paycheck",
        narration: str | None = None,
        tags=(),
        links=(),
        extra_meta: dict | None = None,
    ) -> data.Transaction:
        """Build a balanced beancount paycheck ``Transaction`` (validates accounts + legs).

        Legs are pre-resolved to full accounts; a contribution's label (Roth401k/…) is stamped as
        a ``label`` posting-meta on its leg so the money stays in one account (net worth sees one
        401k pot) while income can still break out the split.
        """
        gross = round_cents(gross)
        deduction_legs = [(a, round_cents(v)) for a, v in deduction_legs]
        contribution_legs = [(a, s, round_cents(v)) for a, s, v in contribution_legs]

        self._assert_accounts_active(
            date,
            [
                income_account,
                deposit_account,
                *(a for a, _ in deduction_legs),
                *(a for a, _, _ in contribution_legs),
            ],
        )

        out = sum((v for _, v in deduction_legs), Decimal(0)) + sum(
            (v for _, _, v in contribution_legs), Decimal(0)
        )
        take_home = gross - out
        if take_home < 0:
            raise ValueError(
                f"deductions and contributions exceed gross (take-home would be {take_home})"
            )

        postings = [_posting(income_account, -gross)]
        for account, amt in deduction_legs:
            postings.append(_posting(account, amt))
        for account, label, amt in contribution_legs:
            postings.append(_posting(account, amt, {"label": label} if label else None))
        postings.append(_posting(deposit_account, take_home))

        meta: dict = {"id": entry_id}
        if extra_meta:
            meta.update(extra_meta)

        return data.Transaction(
            meta, date, "*", payee, narration, frozenset(tags), frozenset(links), postings
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
        entry_id = str(uuid.uuid4())
        entry = self._paycheck_entry(
            date=date,
            gross=gross,
            income_account=income_account,
            deduction_legs=deduction_legs,
            contribution_legs=contribution_legs,
            deposit_account=deposit_account,
            entry_id=entry_id,
            payee=payee,
        )
        self._append("income", date.year, f"; Income for {date.year}", printer.format_entry(entry))

        return entry_id

    def _locate_for_update(
        self, locator: str, date: dt.date | None
    ) -> tuple[data.Transaction, str, dict, dt.date]:
        """Shared preamble for both updates: strict-load, resolve the locator, and derive the
        target entry, its id (assigned if missing), the meta to carry forward, and the resolved
        date (the edit's date, or the entry's own if unchanged)."""
        entry = find_transaction(Ledger(self.main_ledger, strict=True).load().entries, locator)
        entry_id = (entry.meta or {}).get("id") or str(uuid.uuid4())
        carried = {
            k: v
            for k, v in (entry.meta or {}).items()
            if k not in DROPPED_META and not k.startswith("__")
        }
        return entry, entry_id, carried, (date or entry.date)

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
        """Replace the located paycheck in place (or relocate it if the year changes)."""
        entry, entry_id, carried, resolved_date = self._locate_for_update(locator, date)

        new_entry = self._paycheck_entry(
            date=resolved_date,
            gross=Decimal(gross),
            income_account=income_account,
            deduction_legs=[(a, Decimal(v)) for a, v in deduction_legs],
            contribution_legs=[(a, s, Decimal(v)) for a, s, v in contribution_legs],
            deposit_account=deposit_account,
            entry_id=entry_id,
            payee=payee,
            narration=entry.narration,
            tags=entry.tags or (),
            links=entry.links or (),
            extra_meta=carried,
        )

        self._replace_located(
            entry, resolved_date, printer.format_entry(new_entry), "income", locator
        )

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
        entry, entry_id, carried, resolved_date = self._locate_for_update(locator, date)
        credit_legs = [(a, Decimal(amt)) for a, amt in (credits or [])]

        narration = entry.narration if entry.narration and entry.narration != payee else None

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
            narration=narration,
            tags=entry.tags or (),
            links=entry.links or (),
            extra_meta=carried,
        )
        self._replace_located(
            entry, resolved_date, printer.format_entry(new_entry), "spending", locator
        )
        return entry_id

    def _entry_span(
        self, entry: data.Transaction, locator: str
    ) -> tuple[Path, str, list[str], int, int]:
        """Locate an entry's source block: ``(path, original_text, lines, begin, end)``.

        Guards against a stale locator — the ``begin`` line must still be the entry's
        ``<date> <flag>`` header, or we'd clobber the wrong entry — then consumes the entry's
        indented meta/posting lines (a blank line ends the block) to find ``end``."""
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
            end += 1

        return path, original, lines, begin, end

    def _commit(self, path: Path, content: str, original: str) -> None:
        """Write ``content`` to ``path``, strict-reload, and roll ``path`` back to ``original``
        (re-raising) if the reload fails — so a bad write never sticks."""
        _atomic_write(path, content)
        try:
            Ledger(self.main_ledger, strict=True).load()

        except Exception:
            _atomic_write(path, original)
            raise

    def _replace_located(
        self, entry: data.Transaction, resolved_date: dt.date, block: str, subdir: str, locator: str
    ) -> None:
        """Swap ``entry``'s source block for ``block``, then strict-reload with rollback.

        If ``resolved_date`` falls in a different year than the entry, relocate it to
        ``<subdir>/<year>.beancount`` instead of rewriting in place."""
        path, original, lines, begin, end = self._entry_span(entry, locator)

        # A date edit that crosses into a different year must relocate the entry to that year's
        # file, not leave it stranded in the original year's file.
        if resolved_date.year != entry.date.year:
            headers = {
                "spending": f"; Spending transactions for {resolved_date.year}",
                "income": f"; Income for {resolved_date.year}",
            }
            _atomic_write(path, "".join(lines[:begin] + lines[end:]))  # drop from the old file

            try:
                self._append(subdir, resolved_date.year, headers[subdir], block)

            except Exception:
                _atomic_write(path, original)  # restore old file; _append rolled back its own
                raise

            return

        rewritten = "".join(lines[:begin] + block.splitlines(keepends=True) + lines[end:])

        self._commit(path, rewritten, original)

    def delete_transaction(self, locator: str) -> None:
        """Remove the located entry (spending or paycheck) from its file, then strict-reload."""
        entry = find_transaction(
            Ledger(self.main_ledger, strict=True).load().entries, locator
        )  # raises KeyError if unknown

        path, original, lines, begin, end = self._entry_span(entry, locator)

        self._commit(path, "".join(lines[:begin] + lines[end:]), original)

    def open_account(self, account: str, date: dt.date | None = None) -> None:
        """Append an ``open`` directive to the accounts file (e.g. a new contribution type)."""
        date = date or dt.date.today()
        accounts_file = self.ledger_dir / "accounts.beancount"

        original = accounts_file.read_text()
        text = original if original.endswith("\n") else original + "\n"

        self._commit(accounts_file, f"{text}{date.isoformat()} open {account} USD\n", original)

    # --- internals ---

    def _append(self, subdir: str, year: int, header: str, block: str) -> None:
        year_file = self.ledger_dir / subdir / f"{year}.beancount"
        include_line = f'include "{subdir}/{year}.beancount"'
        agg_file = self.ledger_dir / f"{subdir}.beancount"

        year_before = year_file.read_text() if year_file.exists() else None
        main_before = self.main_ledger.read_text() if self.main_ledger.exists() else None
        agg_before = agg_file.read_text() if agg_file.exists() else None

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

            self._restore(agg_file, agg_before)
            self._restore(self.main_ledger, main_before)

            raise

    @staticmethod
    def _restore(path: Path, before: str | None) -> None:
        """Undo a touched file: delete it if it didn't exist before, else rewrite prior content."""
        if before is None:
            path.unlink(missing_ok=True)

        elif path.exists() and path.read_text() != before:
            _atomic_write(path, before)

    def _ensure_include(self, subdir: str, include_line: str) -> None:
        """Register a new year file's include in the ``{subdir}.beancount`` aggregator (which main
        includes), so a new year joins the same load path as the existing ones — not scattered
        into main. Wires the aggregator into main too, for a fresh ledger."""
        self._ensure_main_include(f'include "{subdir}.beancount"')

        aggregator = self.ledger_dir / f"{subdir}.beancount"
        text = aggregator.read_text() if aggregator.exists() else ""
        if include_line in text:
            return

        lines = text.splitlines()
        prefix = f'include "{subdir}/'
        last = max((i for i, ln in enumerate(lines) if ln.startswith(prefix)), default=None)

        if last is None:
            lines.append(include_line)

        else:
            lines.insert(last + 1, include_line)

        _atomic_write(aggregator, "\n".join(lines) + "\n")

    def _ensure_main_include(self, include_line: str) -> None:
        """Idempotently ensure ``include_line`` is present in main.beancount (appends if absent)."""
        text = self.main_ledger.read_text() if self.main_ledger.exists() else ""
        if include_line in text:
            return

        lead = "" if not text or text.endswith("\n") else "\n"
        _atomic_write(self.main_ledger, f"{text}{lead}{include_line}\n")
