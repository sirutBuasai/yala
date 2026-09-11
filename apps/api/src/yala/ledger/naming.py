"""Account display names, derived from the ledger and nothing else.

The ledger holds each account's real, verbose name; shortening is presentation, so it happens here
at read time, driven only by the ``institution``, ``bank_alias`` and ``account_alias`` meta an
``open`` declares. ``institution`` is required whenever an alias is in play: substituting only the
bank half of a name needs something to say where that half ends.

:data:`NAME_CAP` is a target, not a guarantee — a name with no alias to apply is returned at full
length, so callers must still be able to truncate.
"""

from __future__ import annotations

import re
from collections.abc import Mapping

#: Display-name budget, in characters. What a list row can show without truncating.
NAME_CAP = 20

#: Metadata keys this module reads off an ``open`` directive.
INSTITUTION_META = "institution"
BANK_ALIAS_META = "bank_alias"
ACCOUNT_ALIAS_META = "account_alias"

#: Words that stay lowercase inside a name. Only ever applied to interior words, so a leading
#: particle survives untouched.
_PARTICLES = frozenset({"of", "and", "the", "for"})

_LOWER_UPPER = re.compile(r"([a-z0-9])([A-Z])")
_ACRONYM_WORD = re.compile(r"([A-Z]+)([A-Z][a-z])")
_LETTER_DIGIT = re.compile(r"([A-Za-z])(\d)")


def render(leaf: str) -> str:
    """A CamelCase account leaf as display words.

    Splits on case changes, keeps an acronym whole while separating the word that follows
    (``ABBankChecking`` → "AB Bank Checking"), splits letter→digit, and lowercases interior
    particles.
    """
    spaced = _LOWER_UPPER.sub(r"\1 \2", leaf)
    spaced = _ACRONYM_WORD.sub(r"\1 \2", spaced)
    spaced = _LETTER_DIGIT.sub(r"\1 \2", spaced).strip()

    words = spaced.split()

    return " ".join(
        word if i == 0 or word.lower() not in _PARTICLES else word.lower()
        for i, word in enumerate(words)
    )


def to_leaf(display: str) -> str:
    """A typed display name as a CamelCase account leaf — the inverse of :func:`render`.

    Each word's first letter is capitalized and the rest left as typed, so an acronym entered in
    caps survives ("AB Bank" → ``ABBank``) and :func:`render` returns the words as written.
    """
    words = re.sub(r"[^A-Za-z0-9 ]", " ", display).split()

    return "".join(word[:1].upper() + word[1:] for word in words)


def institution_of(meta: Mapping[str, object] | None) -> str | None:
    """The institution an account is held at, as declared. ``None`` when it has none.

    Declared rather than inferred: an account name is not reliable evidence — a plan named for an
    employer but held at a custodian, or a co-brand card naming two institutions, both defeat it.
    """
    value = (meta or {}).get(INSTITUTION_META)

    return str(value) if value else None


def account_name(account: str, meta: Mapping[str, object] | None = None) -> str:
    """The display name for ``account``: the rendered leaf, then — only while it exceeds
    :data:`NAME_CAP` — the bank alias, then the account alias as well."""
    leaf = account.split(":")[-1]
    full = render(leaf)

    if len(full) <= NAME_CAP:
        return full

    meta = meta or {}
    institution = institution_of(meta)
    bank_alias = meta.get(BANK_ALIAS_META)
    account_alias = meta.get(ACCOUNT_ALIAS_META)

    # The account half is whatever follows the declared institution, matched against the *rendered*
    # name so a spaced institution lines up with its CamelCase leaf.
    tail = (
        full[len(institution) :].strip() if institution and full.startswith(institution) else None
    )

    if bank_alias and tail is not None:
        shortened = f"{bank_alias} {tail}".strip()

        if len(shortened) <= NAME_CAP:
            return shortened

        return f"{bank_alias} {account_alias}".strip() if account_alias else shortened

    if account_alias and institution:
        return f"{institution} {account_alias}".strip()

    return full
