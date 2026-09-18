"""Free-text hygiene for anything that reaches a ledger file.

The ledger is line-based and beancount accepts a raw newline inside a quoted string, so a control
character in a payee or a metadata value parses clean and corrupts the file's shape. Requests are
collapsed on the way in; the sink refuses anything that got past that.
"""

from __future__ import annotations

import re

#: C0 control characters (newline and tab included) plus DEL.
CONTROL_RE = re.compile(r"[\x00-\x1f\x7f]")


def collapse(value: str) -> str:
    """``value`` as a single trimmed line, with control characters and runs of space removed."""
    return " ".join(CONTROL_RE.sub(" ", value).split())


def single_line(value: str, label: str) -> str:
    """``value`` unchanged, or a ``ValueError`` if it carries a control character."""
    if CONTROL_RE.search(value):
        raise ValueError(f"{label} must not contain control characters")
    return value
