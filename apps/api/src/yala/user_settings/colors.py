"""Colours the user picks for institutions and categories. Each is one ``#rrggbb`` used as-is in
both themes."""

from __future__ import annotations

import re

#: What a colour can be keyed by. Institutions are keyed by ``institution_name``, categories by the
#: category's own name.
INSTITUTIONS = "institutions"
CATEGORIES = "categories"
FAMILIES = (INSTITUTIONS, CATEGORIES)

#: ``#rgb`` or ``#rrggbb``, case-insensitive. Deliberately narrow: the value ends up in a
#: stylesheet, so nothing that could break out of a declaration gets through — not even a CSS name.
HEX_RE = re.compile(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")

#: What a category starts as before the user picks one. An institution has no starting colour.
DEFAULT_CATEGORY_COLORS = {
    "Housing": "#f7768e",
    "Grocery": "#f295c5",
    "Takeouts": "#bb9af7",
    "Travel": "#6f8fe8",
    "Utilities": "#ff9e64",
    "Transport": "#ffd27f",
    "Personal": "#7dcfff",
    "Health": "#2bb673",
    "Recreation": "#4cc9b0",
    "Subscription": "#ffd5d2",
    "Misc": "#c0794f",
}


def parse_color(value: object) -> str | None:
    """A declared colour as a normalized ``#rrggbb``, or ``None`` if it isn't a hex literal."""
    if not isinstance(value, str) or not HEX_RE.match(value.strip()):
        return None

    digits = value.strip()[1:].lower()

    return "#" + ("".join(c * 2 for c in digits) if len(digits) == 3 else digits)
