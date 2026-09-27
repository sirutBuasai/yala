"""A locator is ``id:<uuid>``, which survives line moves, or ``line:<path>:<lineno>`` with a
ledger-relative path."""

from __future__ import annotations

import os
from pathlib import Path

from beancount.core import data

from yala import config


def ledger_relative(filename: str) -> str:
    """A ledger-relative path, so the absolute source path beancount stamps on an entry never leaks
    into ``data.json``. Falls back to the original when it cannot be made relative."""
    base = str(config.LEDGER_DIR)
    try:
        rel = os.path.relpath(filename, base)
        if not rel.startswith(".."):
            return rel

        # A lexical relpath breaks when the paths differ only by a symlink (e.g. a macOS temp
        # dir surfacing as both /var and /private/var); retry against the canonical paths.
        rel = os.path.relpath(os.path.realpath(filename), os.path.realpath(base))
    except ValueError:
        return filename

    return filename if rel.startswith("..") else rel


def scrub_paths(text: str) -> str:
    """Beancount's error messages carry absolute paths and reach the client verbatim."""
    base = str(config.LEDGER_DIR)

    for prefix in {base, os.path.realpath(base)}:
        text = text.replace(prefix.rstrip(os.sep) + os.sep, "")

    return text


def locator_of(meta: dict | None) -> str:
    """Stable edit handle from an entry's meta: ``id:<uuid>`` if present, else
    ``line:<ledger-relative-path>:<lineno>``."""
    meta = meta or {}
    uid = meta.get("id")

    if uid:
        return f"id:{uid}"

    return f"line:{ledger_relative(meta['filename'])}:{meta['lineno']}"


def resolve_ledger_path(path: str) -> str:
    """Canonical absolute path for a ``line:`` locator path (relative or absolute), so a locator
    round-trips against beancount's ``filename`` meta even across symlinks."""
    absolute = path if os.path.isabs(path) else os.path.join(config.LEDGER_DIR, path)
    return os.path.realpath(absolute)


def _find(entries: list, locator: str, directive: type, label: str):
    """Resolve a locator against the ``directive``-typed entries, or raise ``KeyError``. A ``line:``
    path may be ledger-relative or absolute."""
    kind, _, rest = locator.partition(":")
    candidates = [e for e in entries if isinstance(e, directive)]

    if kind == "id":
        for e in candidates:
            if (e.meta or {}).get("id") == rest:
                return e

    elif kind == "line":
        path, _, lineno = rest.rpartition(":")
        target = resolve_ledger_path(path)
        for e in candidates:
            meta = e.meta or {}
            filename = meta.get("filename")
            if (
                filename is not None
                and os.path.realpath(filename) == target
                and meta.get("lineno") == int(lineno)
            ):
                return e

    raise KeyError(f"no {label} found for locator {locator!r}")


def find_entry(entries: list, locator: str) -> data.Transaction:
    """Resolve a locator (``id:<uuid>`` or ``line:<path>:<lineno>``) to a beancount transaction."""
    return _find(entries, locator, data.Transaction, "transaction")


def find_balance(entries: list, locator: str) -> data.Balance:
    """Resolve a locator to a beancount ``balance`` assertion."""
    return _find(entries, locator, data.Balance, "balance assertion")


def entry_locator(entry: data.Transaction) -> str:
    return locator_of(entry.meta)


def source_of(entry: data.Directive) -> tuple[Path, int]:
    """1-based first line. Raises ``KeyError`` for a synthesized directive."""
    meta = entry.meta or {}
    return Path(meta["filename"]), int(meta["lineno"])


def source_file(entry: data.Directive) -> Path | None:
    """The file a directive came from, or ``None`` when it was synthesized rather than parsed (a
    ``pad``'s generated transaction, for instance)."""
    filename = (entry.meta or {}).get("filename")
    return Path(filename) if filename else None
