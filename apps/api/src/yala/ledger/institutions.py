"""Institution colour, as dated ``custom`` directives keyed by ``institution_name``. With none, no
colour."""

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
    """The latest directive wins. A malformed one is skipped, so one bad line can't blank every
    colour."""
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
    """A swatch counts with no account behind it, or a rename onto that name leaves two colours
    claiming it."""
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
