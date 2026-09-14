"""Account-path syntax: reading a path apart, with no opinion on what the account means.

Kept separate from :mod:`yala.ledger.constants` (which names the subtrees) and from
:mod:`yala.ledger.accounts` (which decides what each subtree *is*), so the syntax has one home and
nothing has to import a policy module to split a name.
"""

from __future__ import annotations


def leaf(account: str) -> str:
    """The last segment of an account path."""
    return account.split(":")[-1]


def parent(account: str) -> str:
    """Everything above the leaf, or ``""`` for a single-segment path."""
    head, _, _ = account.rpartition(":")
    return head
