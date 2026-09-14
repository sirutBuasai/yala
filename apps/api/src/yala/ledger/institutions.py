"""Per-institution presentation, declared in the ledger as ``custom`` directives.

Colour belongs to the institution holding an account rather than to the account itself, so it is
keyed by the ``institution_name`` each ``open`` declares and stated once per institution. Dated and
superseding, so a recolour leaves the old choice behind as history; an institution with no directive
gets no colour.
"""

from __future__ import annotations

import re

from beancount.core import data

from yala.ledger.naming import institution_of

#: ``custom`` directive type that assigns a colour to an institution.
INSTITUTION_TYPE = "yala-institution"

#: ``#rgb`` or ``#rrggbb``, case-insensitive. Deliberately narrow: the value ends up in a
#: stylesheet, so nothing that could break out of a declaration gets through — not even a CSS name.
HEX_RE = re.compile(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")


def parse_color(value: object) -> str | None:
    """A declared colour as a normalized ``#rrggbb``, or ``None`` if it isn't a hex literal."""
    if not isinstance(value, str) or not HEX_RE.match(value.strip()):
        return None

    digits = value.strip()[1:].lower()

    return "#" + ("".join(c * 2 for c in digits) if len(digits) == 3 else digits)


def colors(entries: list[data.Directive]) -> dict[str, str]:
    """Colour per institution, the latest directive winning (``entries`` arrive date-sorted).

    A malformed directive is skipped rather than raising: the ledger is hand-editable, and one bad
    line should not blank every colour in the app.
    """
    out: dict[str, str] = {}

    for entry in entries:
        if not isinstance(entry, data.Custom) or entry.type != INSTITUTION_TYPE:
            continue

        values = [v.value for v in (entry.values or [])]
        if len(values) != 2:
            continue

        institution, declared = values
        if not isinstance(institution, str) or not institution.strip():
            continue

        color = parse_color(declared)
        if color is None:
            continue

        out[institution.strip()] = color

    return out


def named(entries: list[data.Directive]) -> set[str]:
    """Every institution the ledger names — on an account's ``open`` or as a colour swatch.

    A swatch counts even with no account behind it: renaming another institution onto that name
    would leave two directives claiming one colour, and the later one would silently win.
    """
    out = {
        institution
        for entry in entries
        if isinstance(entry, data.Open) and (institution := institution_of(entry.meta))
    }

    for entry in entries:
        if isinstance(entry, data.Custom) and entry.type == INSTITUTION_TYPE:
            first = next((v.value for v in (entry.values or [])), None)

            if isinstance(first, str) and first.strip():
                out.add(first.strip())

    return out
