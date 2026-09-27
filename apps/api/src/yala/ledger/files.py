"""All-or-nothing writes: a strict reload after each, and every touched file restored if it fails,
since a rename rewrites several at once."""

from __future__ import annotations

import os
import tempfile
from collections.abc import Mapping
from pathlib import Path

from yala.ledger.cards import resynced
from yala.ledger.core import Ledger


def atomic_write(path: Path, content: str) -> None:
    """Replace ``path``'s contents in one step, so a reader never sees a half-written file."""
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


def restore(path: Path, before: str | None) -> None:
    """Undo a touched file; ``before=None`` means it did not exist and is deleted."""
    if before is None:
        path.unlink(missing_ok=True)

    elif path.exists() and path.read_text() != before:
        atomic_write(path, before)


def snapshot(paths) -> dict[Path, str | None]:
    """Each path's current text, or ``None`` where it does not exist yet — what a rollback needs."""
    return {path: (path.read_text() if path.exists() else None) for path in paths}


def load_checked(main_ledger: Path, *, resync: bool = True) -> None:
    """With ``resync``, a stale card assertion is reset first (see
    :func:`yala.ledger.cards.resynced`). A card reading passes False, since its figure is what's
    checked."""
    if resync:
        loaded = Ledger(main_ledger, strict=False).load()
        if not loaded.errors:
            return
        fixes = resynced(loaded)
    else:
        fixes = {}

    originals = snapshot(fixes)
    try:
        for path, content in fixes.items():
            atomic_write(path, content)

        Ledger(main_ledger, strict=True).load()

    except Exception:
        for path, before in originals.items():
            restore(path, before)
        raise


def commit(main_ledger: Path, changes: Mapping[Path, str]) -> None:
    """Write every file in ``changes``, then roll the whole set back and re-raise if the checked
    reload of ``main_ledger`` fails."""
    originals = snapshot(changes)

    try:
        for path, content in changes.items():
            atomic_write(path, content)

        load_checked(main_ledger)

    except Exception:
        for path, before in originals.items():
            restore(path, before)
        raise
