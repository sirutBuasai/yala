"""Where a new directive goes in a file, anchored on the directives already there, so nothing
restates how a ledger is laid out."""

from __future__ import annotations

import datetime as dt
import os
from collections.abc import Callable, Iterable
from pathlib import Path
from typing import NamedTuple

from beancount.core import data

from yala.ledger.locators import source_file, source_of
from yala.ledger.rewrite import block_end

#: Marks a month section in a balance file. Also what ends the section before it.
SECTION_MARKER = "; ====="

#: Month abbreviations, spelled here rather than through ``strftime`` so a heading never depends on
#: the machine's locale.
_MONTHS = ("JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC")


class Span(NamedTuple):
    """One directive's place in a file: 0-based first line, one past its last, and its date."""

    begin: int
    end: int
    date: dt.date


def month_header(date: dt.date) -> str:
    return f"{SECTION_MARKER} {_MONTHS[date.month - 1]} {date.year} ====="


def spans(
    entries: Iterable[data.Directive],
    path: Path,
    lines: list[str],
    keep: Callable[[data.Directive], bool] = lambda _: True,
) -> list[Span]:
    """Directives with no source or a stale line are skipped, so a write may land imprecisely but
    never over an entry."""
    target = os.path.realpath(path)
    found: list[Span] = []

    for entry in entries:
        source = source_file(entry)

        if source is None or os.path.realpath(source) != target or not keep(entry):
            continue

        begin = source_of(entry)[1] - 1

        if 0 <= begin < len(lines):
            found.append(Span(begin, block_end(lines, begin), entry.date))

    return sorted(found, key=lambda span: span.begin)


def insert_at(lines: list[str], anchors: list[Span], date: dt.date, *, spaced: bool) -> int:
    """After the last anchor it doesn't predate, else above the first, else at the end. ``spaced``
    lands it after the blank separator, not inside it."""
    if not anchors:
        return len(lines)

    previous = None
    for anchor in anchors:
        if anchor.date <= date:
            previous = anchor

    if previous is None:
        return anchors[0].begin

    at = previous.end

    if spaced:
        while at < len(lines) and not lines[at].strip():
            at += 1

    return at


def section_slot(lines: list[str], anchors: list[Span], date: dt.date) -> tuple[int, str | None]:
    """Ordered against its month's entries, plus the heading to write when the month has none:
    anchoring on the whole file could file it above its heading."""
    header = month_header(date)
    at = next((i for i, line in enumerate(lines) if line.rstrip() == header), None)

    if at is None:
        return insert_at(lines, anchors, date, spaced=True), header

    stop = next(
        (i for i in range(at + 1, len(lines)) if lines[i].startswith(SECTION_MARKER)),
        len(lines),
    )
    inside = [span for span in anchors if at < span.begin < stop]

    if not inside:
        return at + 1, None

    return insert_at(lines, inside, date, spaced=True), None


def splice(lines: list[str], at: int, block: str, *, spaced: bool) -> str:
    """At the end of the file the separator goes before the block, having nothing after it to
    separate."""
    body = block.rstrip("\n") + "\n"

    if at >= len(lines):
        head = "".join(lines)

        if head and not head.endswith("\n"):
            head += "\n"

        if spaced and head and not head.endswith("\n\n"):
            head += "\n"

        return head + body

    return "".join(lines[:at]) + body + ("\n" if spaced else "") + "".join(lines[at:])


def cut(lines: list[str], begin: int, end: int) -> tuple[list[str], int]:
    """Takes the spacing blank with the block, so deletes never leave gaps. Returns the lines
    removed too."""
    stop = end

    if stop < len(lines) and not lines[stop].strip():
        stop += 1

    return lines[:begin] + lines[stop:], stop - begin


def without(anchors: list[Span], begin: int, removed: int) -> list[Span]:
    """Anchors come from a parse before the cut, so later ones shift up by ``removed``."""
    return [
        span._replace(begin=span.begin - removed, end=span.end - removed)
        if span.begin > begin
        else span
        for span in anchors
        if span.begin != begin
    ]


def include_at(lines: list[str], include_line: str) -> int:
    """Where ``include_line`` goes among the includes a file already has: sorted position, so a new
    year file joins the list in order instead of after whatever was added last."""
    existing = [i for i, line in enumerate(lines) if line.startswith('include "')]

    if not existing:
        return len(lines)

    for i in existing:
        if lines[i].strip() > include_line:
            return i

    return existing[-1] + 1
