"""Path syntax only, so splitting a name needs no policy module."""

from __future__ import annotations


def leaf(account: str) -> str:
    """The last segment of an account path."""
    return account.split(":")[-1]


def parent(account: str) -> str:
    """Everything above the leaf, or ``""`` for a single-segment path."""
    head, _, _ = account.rpartition(":")
    return head
