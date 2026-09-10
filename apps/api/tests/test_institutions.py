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
            directive("BankA", "#f7768e"),
            directive("BrokerageA", "#9ece6a"),
        ]

        assert colors(entries) == {"BankA": "#f7768e", "BrokerageA": "#9ece6a"}

    def test_later_directive_supersedes(self) -> None:
        """Recolouring leaves the old choice in the file as history rather than rewriting it."""
        entries = [
            directive("BankA", "#f7768e", date="2026-01-01"),
            directive("BankA", "#d94c4c", date="2026-06-01"),
        ]

        assert colors(entries) == {"BankA": "#d94c4c"}

    def test_ignores_other_custom_types(self) -> None:
        entries = [
            directive("swr", 4.0, kind="yala-setting"),
            directive("BankA", "#7dcfff"),
        ]

        assert colors(entries) == {"BankA": "#7dcfff"}

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
        """The ledger is hand-editable, so one bad line must not blank every colour."""
        entries = [
            directive("BankA"),  # missing the swatch
            directive("BankA", "#7dcfff", "extra"),  # too many values
            directive("", "#7dcfff"),  # no institution
            directive("BankB", 42),  # not a string
            directive("BankC", "#9ece6a"),  # the only good one
        ]

        assert colors(entries) == {"BankC": "#9ece6a"}

    def test_accepts_only_hex_literals(self) -> None:
        """The value reaches a stylesheet, so anything but a hex literal is dropped — including a
        colour name CSS would understand."""
        entries = [
            directive("A", "#F7768E"),  # normalized to lowercase
            directive("B", "#abc"),  # shorthand is expanded
            directive("C", "salmon"),  # a CSS colour name: rejected
            directive("D", "red); background: url(x"),  # injection attempt
            directive("E", "f7768e"),  # missing the hash
        ]

        assert colors(entries) == {"A": "#f7768e", "B": "#aabbcc"}
