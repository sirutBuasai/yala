"""Free-text hygiene: what reaches a ledger file has to be one line."""

from __future__ import annotations

import pytest

from yala.text import collapse, single_line


def test_collapse_folds_control_characters_and_runs_of_space():
    assert collapse("  two\t\tspaced\nwords  ") == "two spaced words"


def test_collapse_of_only_control_characters_is_empty():
    assert collapse("\n\t\x00") == ""


def test_single_line_passes_ordinary_text_through():
    assert single_line("Bank of A", "institution") == "Bank of A"


@pytest.mark.parametrize("value", ["a\nb", "a\tb", "a\x00b", "a\x7fb"])
def test_single_line_refuses_a_control_character(value: str):
    """Beancount accepts a raw newline inside a quoted string, so a strict reload would pass and the
    file would silently gain a line. This is the check that catches it."""
    with pytest.raises(ValueError, match="institution"):
        single_line(value, "institution")
