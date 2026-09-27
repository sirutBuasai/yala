"""Rather than predict the pads an edited assertion needs, each round writes and lets beancount name
what is missing or redundant."""

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


def _apply_one(
    account: str, errors: list, work: Work, originals: Originals, pad_through: dt.date | None
) -> bool:
    """True if anything moved. Only this account's pads are touched, so unrelated errors surface."""
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
            if pad_through is not None and entry.date > pad_through:
                continue
            pad_date = entry.date - dt.timedelta(days=1)
            at = insert_index(lines, pad_date, n)
            lines[at:at] = [f"{pad_date} {PAD} {account} {snapshot_plug(account)}\n", "\n"]
            return True

    return False


def settle(
    main_ledger: Path,
    account: str,
    work: Work,
    originals: Originals,
    pad_through: dt.date | None = None,
) -> None:
    """Pads no assertion after ``pad_through`` (None: any). Any other error, or :data:`MAX_ROUNDS`,
    restores every touched file and re-raises."""
    try:
        for _ in range(MAX_ROUNDS):
            for path, lines in work.items():
                files.atomic_write(path, "".join(lines))

            errors = Ledger(main_ledger, strict=False).load().errors
            if not errors:
                return

            if not _apply_one(account, errors, work, originals, pad_through):
                break

        Ledger(main_ledger, strict=True).load()  # unresolved: surface beancount's own text

    except Exception:
        for path, before in originals.items():
            files.atomic_write(path, before)
        raise
