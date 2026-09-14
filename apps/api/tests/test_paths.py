"""Account-path syntax: splitting a name apart, with no opinion on what it means."""

from __future__ import annotations

import pytest

from yala.ledger.paths import leaf, parent


@pytest.mark.parametrize(
    "account,expected",
    [("Assets:Cash:BankB", "BankB"), ("Solo", "Solo"), ("A:B:C:D", "D")],
)
def test_leaf_returns_the_last_segment(account: str, expected: str):
    assert leaf(account) == expected


@pytest.mark.parametrize(
    "account,expected",
    [("Assets:Cash:BankB", "Assets:Cash"), ("Solo", ""), ("A:B", "A")],
)
def test_parent_returns_everything_above_the_leaf(account: str, expected: str):
    assert parent(account) == expected
