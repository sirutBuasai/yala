"""Account display names, derived from the ledger and nothing else.

The ledger holds each account's **real, verbose** name — the bank spelled out in full, not an
abbreviation — because the ledger is the source of truth and should read as the thing it describes.
Shortening is a presentation concern, so it happens here, at read time, driven entirely by metadata
the ledger states. This module decides *how* a name is formatted; it never decides *what* an account
is called. Nothing here guesses.

Three keys on the ``open`` directive drive it::

    2020-01-01 open Liabilities:CC:BankOfExampleCashRewards USD
      institution: "Bank of Example"    ; where the bank half of the name ends
      bank_alias: "BoE"                 ; short form of the bank half
      account_alias: "Cash"             ; short form of the account half

``institution`` is not optional when an alias is in play: substituting only the *bank* half means
something has to say where that half ends, and matching the declared institution as a prefix of the
rendered name is the only way to know without guessing. It doubles as the key the UI colours by.

The name is resolved in five steps (:func:`account_name`):

1. Render the leaf from CamelCase.
2. At or under :data:`NAME_CAP` characters, use it.
3. Over the cap with both aliases present: substitute ``bank_alias``, then **re-check** — only if it
   is still over does ``account_alias`` go in as well.
4. No ``bank_alias``: substitute ``account_alias``.
5. No alias at all: keep the rendered name at full length.

The cap is a target, not a guarantee — step 5 can return a long name, so callers must be able to
truncate. Today every account in the ledger lands at or under it.
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

#: Words that stay lowercase inside a name: "BankOfAmerica" is "Bank of America", not "Bank Of
#: America". Only ever applied to interior words, so a leading "Of" would survive untouched.
_PARTICLES = frozenset({"of", "and", "the", "for"})

_LOWER_UPPER = re.compile(r"([a-z0-9])([A-Z])")
_ACRONYM_WORD = re.compile(r"([A-Z]+)([A-Z][a-z])")
_LETTER_DIGIT = re.compile(r"([A-Za-z])(\d)")


def render(leaf: str) -> str:
    """A CamelCase account leaf as display words.

    Splits on case changes (``SavingsAccount`` → "Savings Account"), keeps acronyms whole while
    separating the word that follows (``ABBankChecking`` → "AB Bank Checking"), splits letter→digit
    (``Employer401k`` → "Employer 401k"), and drops interior particles to lowercase
    (``BankOfExample`` → "Bank of Example"). The last two matter more than they look: both produce
    names that no amount of aliasing would fix, because neither is a length problem.
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

    Used when opening an account: the form asks for an institution and an account name as people
    write them ("Bank of Example", "Cash Rewards") and this joins them into the leaf the ledger
    stores (``BankOfExampleCashRewards``). Each word's first letter is capitalized and the rest is
    left as typed, so an acronym the user entered in caps survives ("US Bank" → ``USBank``) and
    :func:`render` turns the result back into the words they wrote.
    """
    words = re.sub(r"[^A-Za-z0-9 ]", " ", display).split()

    return "".join(word[:1].upper() + word[1:] for word in words)


def institution_of(meta: Mapping[str, object] | None) -> str | None:
    """The institution an account is held at, as declared. ``None`` when it has none.

    Declared rather than inferred on purpose. Substring-matching an account name is wrong in four
    common shapes: an employer-sponsored plan named for the employer but held at a custodian, a
    co-brand card whose name contains *two* institutions, a card issued by one bank and branded by
    another, and a salary account whose employer happens to share a name with an institution.
    """
    value = (meta or {}).get(INSTITUTION_META)

    return str(value) if value else None


def account_name(account: str, meta: Mapping[str, object] | None = None) -> str:
    """The display name for ``account``, resolved by the five-step rule above."""
    leaf = account.split(":")[-1]
    full = render(leaf)

    if len(full) <= NAME_CAP:
        return full

    meta = meta or {}
    institution = institution_of(meta)
    bank_alias = meta.get(BANK_ALIAS_META)
    account_alias = meta.get(ACCOUNT_ALIAS_META)

    # The account half is whatever follows the declared institution. Matched against the *rendered*
    # name, so a spaced institution like "Bank of Example" lines up with a `BankOfExample...` leaf —
    # the particle and acronym rules leave both sides spelled the same way.
    tail = (
        full[len(institution) :].strip() if institution and full.startswith(institution) else None
    )

    if bank_alias and tail is not None:
        shortened = f"{bank_alias} {tail}".strip()

        if len(shortened) <= NAME_CAP:
            return shortened

        # Still too long: shorten the account half as well, if it offers a short form.
        return f"{bank_alias} {account_alias}".strip() if account_alias else shortened

    if account_alias and institution:
        return f"{institution} {account_alias}".strip()

    return full
