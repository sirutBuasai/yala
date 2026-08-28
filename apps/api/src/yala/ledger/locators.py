"""Entry locators: stable handles that identify a ledger entry across edits.

A locator is either ``id:<uuid>`` (preferred — survives line moves) or ``line:<path>:<lineno>``.
These helpers format a locator from an entry's meta, resolve one back to a beancount transaction,
and keep ledger paths relative so a private absolute path never leaks into ``data.json``.
"""

from __future__ import annotations

import os

from beancount.core import data

from yala import config


def ledger_relative(filename: str) -> str:
    """A ledger-relative path, so a private absolute path never leaks into ``data.json``.

    beancount stamps entries with the absolute source path; emitting that verbatim in a
    ``line:`` locator would embed e.g. ``/Users/<owner>/.../ledger`` in the public snapshot.
    Falls back to the original path when it can't be made relative (outside the ledger dir,
    or a different drive on Windows)."""
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


def locator_of(meta: dict | None) -> str:
    """Stable edit handle from an entry's meta: ``id:<uuid>`` if present, else
    ``line:<ledger-relative-path>:<lineno>``. Shared by the entity view and the raw-entry
    sink helpers."""
    meta = meta or {}
    uid = meta.get("id")

    if uid:
        return f"id:{uid}"

    return f"line:{ledger_relative(meta['filename'])}:{meta['lineno']}"


def resolve_ledger_path(path: str) -> str:
    """Canonical absolute path for a ``line:`` locator path (accepts relative or absolute), so a
    ledger-relative locator round-trips against beancount's ``filename`` meta even across symlinks
    (e.g. macOS /var vs /private/var)."""
    absolute = path if os.path.isabs(path) else os.path.join(config.LEDGER_DIR, path)
    return os.path.realpath(absolute)


def find_entry(entries: list, locator: str) -> data.Transaction:
    """Resolve a locator (``id:<uuid>`` or ``line:<path>:<lineno>``) to a beancount transaction.

    ``line:`` paths are ledger-relative (see :func:`locator_of`); legacy absolute paths still
    resolve too."""
    kind, _, rest = locator.partition(":")
    txns = [e for e in entries if isinstance(e, data.Transaction)]

    if kind == "id":
        for e in txns:
            if (e.meta or {}).get("id") == rest:
                return e

    elif kind == "line":
        path, _, lineno = rest.rpartition(":")
        target = resolve_ledger_path(path)
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
