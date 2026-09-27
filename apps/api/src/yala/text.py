"""Beancount accepts raw newlines in quoted strings, so control characters would corrupt the
line-based file. Requests are collapsed on the way in, and the sink refuses anything that slips
past."""

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
