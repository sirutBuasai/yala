"""Settling ``pad`` directives after a ``balance`` assertion is edited.

Editing an assertion shifts the running balance until the next assertion re-pins it, so a pad may be
needed at the edited date *and* at that next one, possibly in another year's file. Rather than
predict them, each round writes the candidate files and lets beancount name what is missing (a
failed assertion → add its pad) or redundant (an unused pad → drop it).
"""

from __future__ import annotations

import datetime as dt
from pathlib import Path

from beancount.ops.balance import BalanceError
from beancount.ops.pad import PadError

from yala.ledger import files
from yala.ledger.accounts import snapshot_plug
from yala.ledger.constants import PAD
from yala.ledger.core import Ledger

# Rounds allowed to settle pads after a balance edit: one for the edited assertion, one for the
# next assertion that re-pins the account, plus slack for a drop that reveals another.
MAX_ROUNDS = 6

#: A file's line buffer part-way through settling, and the text it started as.
Work = dict[Path, list[str]]
Originals = dict[Path, str]


def insert_index(lines: list[str], pad_date: dt.date, balance_index: int) -> int:
    """Where to slot a new ``pad``: joining that date's existing pad group if there is one, else
    above the assertion it serves."""
    tag = f"{pad_date} {PAD} "
    group = [n for n, line in enumerate(lines) if line.startswith(tag)]
    if not group:
        return balance_index

    at = group[-1] + 1  # past the group's last pad, and the blank line spacing it
    while at < len(lines) and not lines[at].strip():
        at += 1
    return at


def _working(path: Path, work: Work, originals: Originals) -> list[str]:
    """The mutable line buffer for ``path``, recording its original text on first touch."""
    if path not in work:
        originals[path] = path.read_text()
        work[path] = originals[path].splitlines(keepends=True)
    return work[path]


def _apply_one(account: str, errors: list, work: Work, originals: Originals) -> bool:
    """Add or drop one of ``account``'s pads in response to ``errors``; True if anything moved.

    Only this account's pads are touched — an unrelated complaint is left for the caller to surface
    rather than papered over with a plug.
    """
    for e in errors:
        source = getattr(e, "source", None) or {}
        entry = getattr(e, "entry", None)
        filename, lineno = source.get("filename"), source.get("lineno")

        if not filename or not lineno or getattr(entry, "account", None) != account:
            continue

        lines = _working(Path(filename), work, originals)
        n = int(lineno) - 1

        if isinstance(e, PadError):
            if not lines[n].startswith(f"{entry.date} {PAD} {account} "):
                continue
            del lines[n]
            if n < len(lines) and not lines[n].strip():
                del lines[n]  # and the blank line that spaced it
            return True

        if isinstance(e, BalanceError):
            pad_date = entry.date - dt.timedelta(days=1)
            at = insert_index(lines, pad_date, n)
            lines[at:at] = [f"{pad_date} {PAD} {account} {snapshot_plug(account)}\n", "\n"]
            return True

    return False


def settle(main_ledger: Path, account: str, work: Work, originals: Originals) -> None:
    """Write ``work``, then add or drop ``account``'s pads until the ledger loads clean.

    Any error other than a pad this account can fix, or exhausting :data:`MAX_ROUNDS`, restores
    every touched file and re-raises.
    """
    try:
        for _ in range(MAX_ROUNDS):
            for path, lines in work.items():
                files.atomic_write(path, "".join(lines))

            errors = Ledger(main_ledger, strict=False).load().errors
            if not errors:
                return

            if not _apply_one(account, errors, work, originals):
                break

        Ledger(main_ledger, strict=True).load()  # unresolved: surface beancount's own text

    except Exception:
        for path, before in originals.items():
            files.atomic_write(path, before)
        raise
