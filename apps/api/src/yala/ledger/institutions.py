"""Per-institution presentation, declared in the ledger.

An account's colour is a property of the institution holding it, not of the account: a bank's card
and its savings should read as one family. So it is keyed by the ``institution`` each ``open``
declares, and stated once per institution rather than repeated on every account::

    2026-09-03 custom "yala-institution" "Bank of Example" "#f7768e"

Dated and superseding, exactly like the ``yala-setting`` directives — recolouring an institution
leaves the old choice behind as history instead of rewriting it.

The value is a hex literal, so a colour picker in the UI can write one directly and the ledger stays
the source of truth for it. That one colour is used as-is in both themes; picking a mid-tone that
reads on the light and the dark surface alike is the chooser's call, not something the app adjusts
behind them.

An institution with no directive gets no colour, and the UI falls back to a neutral swatch — a newly
opened account looks like "an account" rather than vanishing.
"""

from __future__ import annotations

import re

from beancount.core import data

#: ``custom`` directive type that assigns a colour to an institution.
INSTITUTION_TYPE = "yala-institution"

#: An accepted colour literal: ``#rgb`` or ``#rrggbb``, case-insensitive. Deliberately narrow — the
#: value ends up in a stylesheet, so a CSS colour *name* is refused even though CSS would understand
#: it, and anything that could break out of a declaration cannot get through at all.
HEX_RE = re.compile(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")


def parse_color(value: object) -> str | None:
    """A declared colour as a normalized ``#rrggbb``, or ``None`` if it isn't a hex literal."""
    if not isinstance(value, str) or not HEX_RE.match(value.strip()):
        return None

    digits = value.strip()[1:].lower()

    return "#" + ("".join(c * 2 for c in digits) if len(digits) == 3 else digits)


def colors(entries: list[data.Directive]) -> dict[str, str]:
    """Colour per institution, latest directive winning.

    Entries arrive in ledger order (beancount sorts by date), so a later directive for the same
    institution overwrites the earlier one. A value that is not a hex literal is skipped rather than
    raising: the ledger is hand-editable, and one bad line should not blank every dot in the app.
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
