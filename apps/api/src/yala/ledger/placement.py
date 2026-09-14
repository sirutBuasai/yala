"""Where a new directive belongs in a file.

A ledger file is organised, not a log, so appending to the end breaks whichever grouping the write
lands in and every write asks here for its line first. The anchors are the directives already in the
file, found through their parsed source lines — the file's own contents decide where the next one
goes, so nothing here restates how a ledger is laid out.
"""

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
    """The section heading a balance file gives ``date``'s month."""
    return f"{SECTION_MARKER} {_MONTHS[date.month - 1]} {date.year} ====="


def spans(
    entries: Iterable[data.Directive],
    path: Path,
    lines: list[str],
    keep: Callable[[data.Directive], bool] = lambda _: True,
) -> list[Span]:
    """Line spans of the directives ``path`` declares and ``keep`` accepts, in file order.

    A directive with no source, and one whose recorded line is no longer in the file, are both
    skipped: a stale parse may then place a write imprecisely, but never over an existing entry.
    """
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
    """The line index a directive dated ``date`` goes at, keeping its group in date order.

    After the last anchor it does not predate, above the first when it predates them all, and at the
    end of the file when there is no anchor to sit beside. ``spaced`` steps past the blank line
    separating one entry from the next, so the directive lands after the gap, not inside it.
    """
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
    """Where a dated directive goes in a month-sectioned file, and the heading to write above it
    when its month has none yet.

    Ordered against the month's own entries: anchoring on the whole file would file an entry dated
    earlier than everything in its month *above* that month's heading.
    """
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
    """``lines`` with ``block`` inserted at line index ``at``, blank-line separated when ``spaced``.

    At the end of the file the separator goes *before* the block instead, since there is nothing
    after it to separate from.
    """
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
    """``lines`` without the block at ``[begin, end)`` and the blank line that spaced it, and how
    many lines went.

    Taking the blank with the block keeps a file from growing a gap every time an entry is deleted
    or re-dated out of it.
    """
    stop = end

    if stop < len(lines) and not lines[stop].strip():
        stop += 1

    return lines[:begin] + lines[stop:], stop - begin


def without(anchors: list[Span], begin: int, removed: int) -> list[Span]:
    """``anchors`` with the one at ``begin`` dropped and every later one shifted up by ``removed``.

    Line numbers come from a parse of the file *before* a cut, so re-placing what was cut has to
    account for the lines that went.
    """
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
