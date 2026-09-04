"""Per-institution colours declared as `custom "yala-institution"` directives."""

from __future__ import annotations

import datetime as dt

from beancount.core import data
from beancount.parser.grammar import ValueType

from yala.ledger.institutions import INSTITUTION_TYPE, colors


def directive(*values: object, date: str = "2026-01-01", kind: str = INSTITUTION_TYPE):
    return data.Custom(
        meta={},
        date=dt.date.fromisoformat(date),
        type=kind,
        values=[ValueType(v, type(v)) for v in values],
    )


class TestColors:
    def test_reads_one_colour_per_institution(self) -> None:
        entries = [
            directive("Bank of Example", "#f7768e"),
            directive("Example Brokerage", "#9ece6a"),
        ]

        assert colors(entries) == {"Bank of Example": "#f7768e", "Example Brokerage": "#9ece6a"}

    def test_later_directive_supersedes(self) -> None:
        """Recolouring leaves the old choice in the file as history rather than rewriting it."""
        entries = [
            directive("Bank of Example", "#f7768e", date="2026-01-01"),
            directive("Bank of Example", "#d94c4c", date="2026-06-01"),
        ]

        assert colors(entries) == {"Bank of Example": "#d94c4c"}

    def test_ignores_other_custom_types(self) -> None:
        entries = [
            directive("swr", 4.0, kind="yala-setting"),
            directive("Bank of Example", "#7dcfff"),
        ]

        assert colors(entries) == {"Bank of Example": "#7dcfff"}

    def test_ignores_non_custom_entries(self) -> None:
        opened = data.Open(
            meta={},
            date=dt.date(2026, 1, 1),
            account="Assets:Cash:BankA",
            currencies=None,
            booking=None,
        )

        assert colors([opened]) == {}

    def test_skips_malformed_entries_rather_than_raising(self) -> None:
        """The ledger is hand-editable, so one bad line must not blank every dot in the app."""
        entries = [
            directive("Bank of Example"),  # missing the swatch
            directive("Bank of Example", "#7dcfff", "extra"),  # too many values
            directive("", "#7dcfff"),  # no institution
            directive("Second Example Bank", 42),  # not a string
            directive("Third Example Bank", "#9ece6a"),  # the only good one
        ]

        assert colors(entries) == {"Third Example Bank": "#9ece6a"}

    def test_accepts_only_hex_literals(self) -> None:
        """The value reaches a stylesheet, so a colour NAME is not accepted even though CSS would
        understand it — anything but a hex is dropped and the account falls back to the neutral."""
        entries = [
            directive("A", "#F7768E"),  # normalized to lowercase
            directive("B", "#abc"),  # shorthand is expanded
            directive("C", "salmon"),  # a CSS colour name: rejected
            directive("D", "red); background: url(x"),  # injection attempt
            directive("E", "f7768e"),  # missing the hash
        ]

        assert colors(entries) == {"A": "#f7768e", "B": "#aabbcc"}
