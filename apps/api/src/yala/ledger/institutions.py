"""Which institution names are taken, so a rename never merges two institutions."""

from __future__ import annotations

from collections.abc import Iterable

from beancount.core import data

from yala.ledger.naming import institution_of


def named(entries: list[data.Directive], colored: Iterable[str] = ()) -> set[str]:
    """A coloured name counts with no account behind it, or a rename onto that name leaves two
    colours claiming it."""
    return {
        institution
        for entry in entries
        if isinstance(entry, data.Open) and (institution := institution_of(entry.meta))
    } | set(colored)
