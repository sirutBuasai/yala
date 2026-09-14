"""Account display names, derived from the ledger and nothing else.

A named account's ``open`` records the name in the parts it was typed in, beside an alias for each.
The name is those parts joined, and shortening happens at read time by swapping the aliases in.
Storing the parts rather than splitting the leaf back apart is what lets a name be edited a part at
a time and shown back as written; an account with no parts on file falls back to its leaf.
"""

from __future__ import annotations

import re
from collections.abc import Mapping
from dataclasses import dataclass

from yala.ledger.paths import leaf

#: Display-name budget, in characters: what a list row shows without truncating. A target, not a
#: guarantee — a name with no short form to apply is returned at full length, so callers must still
#: be able to truncate.
NAME_CAP = 20

INSTITUTION_NAME_META = "institution_name"
ACCOUNT_NAME_META = "account_name"
INSTITUTION_ALIAS_META = "institution_alias"
ACCOUNT_ALIAS_META = "account_alias"


@dataclass(frozen=True)
class NamePart:
    """One part of a named account's name. Which parts an account has is the kind's business; what
    each part *is* is decided here, so opening, editing and renaming read one set of answers."""

    #: Request field, contract field and meta key all share this name.
    field: str
    #: Belongs to the institution rather than to one account held there, so a change to it applies
    #: to every account held there.
    shared: bool
    #: Belongs to the product half of the name, which only a kind whose name has one carries.
    product: bool
    #: Names the account. Changing it rewrites the leaf, so it is a rename, not a metadata edit; the
    #: rest only shorten what the name renders as.
    names: bool


#: Every part of a name, in the order a form asks for them.
NAME_PARTS: tuple[NamePart, ...] = (
    NamePart(INSTITUTION_NAME_META, shared=True, product=False, names=True),
    NamePart(ACCOUNT_NAME_META, shared=False, product=True, names=True),
    NamePart(INSTITUTION_ALIAS_META, shared=True, product=False, names=False),
    NamePart(ACCOUNT_ALIAS_META, shared=False, product=True, names=False),
)

PART_BY_FIELD: dict[str, NamePart] = {part.field: part for part in NAME_PARTS}

#: Words that stay lowercase inside a name. Only ever applied to interior words, so a leading
#: particle survives untouched.
_PARTICLES = frozenset({"of", "and", "the", "for"})

_LOWER_UPPER = re.compile(r"([a-z0-9])([A-Z])")
_ACRONYM_WORD = re.compile(r"([A-Z]+)([A-Z][a-z])")
_LETTER_DIGIT = re.compile(r"([A-Za-z])(\d)")


def render(leaf: str) -> str:
    """A CamelCase account leaf as display words.

    Splits on case changes, keeps an acronym whole while separating the word that follows, splits
    letter→digit, and lowercases interior particles.
    """
    spaced = _LOWER_UPPER.sub(r"\1 \2", leaf)
    spaced = _ACRONYM_WORD.sub(r"\1 \2", spaced)
    spaced = _LETTER_DIGIT.sub(r"\1 \2", spaced).strip()

    words = spaced.split()

    return " ".join(
        word if i == 0 or word.lower() not in _PARTICLES else word.lower()
        for i, word in enumerate(words)
    )


def compose(typed: str) -> str:
    """Typed words as the account segment they name — the inverse of :func:`render`.

    Each word's first letter is capitalized and the rest left as typed, so an acronym entered in
    caps survives and :func:`render` returns the words as written.
    """
    words = re.sub(r"[^A-Za-z0-9 ]", " ", typed).split()

    return "".join(word[:1].upper() + word[1:] for word in words)


def compose_stem(institution: str | None, product: str | None = None) -> str:
    """The single path segment a name's parts compose to.

    The one composer: every account path is built from this, so a leaf and the parts recorded beside
    it cannot describe different names.
    """
    return compose(institution or "") + compose(product or "")


def _part(meta: Mapping[str, object] | None, key: str) -> str | None:
    value = (meta or {}).get(key)

    return str(value) if value else None


def institution_of(meta: Mapping[str, object] | None) -> str | None:
    """The institution an account is held at, as declared. ``None`` when it has none.

    Declared rather than inferred: an account name is not reliable evidence — a plan named for an
    employer but held at a custodian, or a co-brand card naming two institutions, both defeat it.
    """
    return _part(meta, INSTITUTION_NAME_META)


def name_parts(meta: Mapping[str, object] | None) -> tuple[str | None, str | None]:
    """The institution half and the product half of a name, as the ``open`` declares them."""
    return _part(meta, INSTITUTION_NAME_META), _part(meta, ACCOUNT_NAME_META)


def shared_parts(meta: Mapping[str, object] | None) -> dict[str, str]:
    """The recorded parts that belong to the institution rather than to one account held there.

    What a new account at a known institution inherits, so one institution never reads two ways.
    """
    return {
        part.field: value
        for part in NAME_PARTS
        if part.shared and (value := _part(meta, part.field)) is not None
    }


def account_name(account: str, meta: Mapping[str, object] | None = None) -> str:
    """The display name for ``account``: its parts joined, shortened only while the result exceeds
    :data:`NAME_CAP` — the institution's short form first, then the product's as well.

    Falls back to the leaf read as words for an account that declares no parts.
    """
    institution, product = name_parts(meta)

    if institution is None and product is None:
        return render(leaf(account))

    short_institution = _part(meta, INSTITUTION_ALIAS_META) or institution
    short_product = _part(meta, ACCOUNT_ALIAS_META) or product

    # Shortest last: the first that fits wins, and if none do the shortest is the best on offer.
    candidates = [
        (institution, product),
        (short_institution, product),
        (short_institution, short_product),
    ]

    names = [" ".join(filter(None, pair)) for pair in candidates]

    return next((name for name in names if len(name) <= NAME_CAP), names[-1])
