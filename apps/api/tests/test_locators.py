"""Entry locators: format a handle from meta, resolve one back to an entry, keep paths relative."""

from __future__ import annotations

import os
from pathlib import Path

import pytest
from beancount.core import data

from yala import config
from yala.ledger import Ledger
from yala.ledger.locators import (
    entry_locator,
    find_entry,
    ledger_relative,
    locator_of,
    resolve_ledger_path,
    source_file,
    source_of,
)

FIXTURE_LEDGER = Path(__file__).parent / "fixtures" / "ledger" / "main.beancount"


def test_locator_of_prefers_id():
    assert locator_of({"id": "abc"}) == "id:abc"


def test_locator_of_falls_back_to_ledger_relative_line(monkeypatch, tmp_path):
    monkeypatch.setattr(config, "LEDGER_DIR", tmp_path)
    meta = {"filename": str(tmp_path / "spending" / "2025.beancount"), "lineno": 7}
    assert locator_of(meta) == "line:spending/2025.beancount:7"


def test_ledger_relative_makes_paths_relative(monkeypatch, tmp_path):
    monkeypatch.setattr(config, "LEDGER_DIR", tmp_path)
    assert ledger_relative(str(tmp_path / "accounts.beancount")) == "accounts.beancount"


def test_ledger_relative_returns_original_when_outside_ledger_dir(monkeypatch, tmp_path):
    monkeypatch.setattr(config, "LEDGER_DIR", tmp_path / "ledger")
    assert ledger_relative("/etc/hosts") == "/etc/hosts"


def test_resolve_ledger_path_absolutizes_relative_against_ledger_dir(monkeypatch, tmp_path):
    monkeypatch.setattr(config, "LEDGER_DIR", tmp_path)
    assert resolve_ledger_path("spending/2025.beancount") == os.path.realpath(
        str(tmp_path / "spending" / "2025.beancount")
    )


def test_entry_locator_and_find_entry_round_trip():
    entries = Ledger(FIXTURE_LEDGER).load().entries
    txn = next(e for e in entries if isinstance(e, data.Transaction))
    assert find_entry(entries, entry_locator(txn)) is txn


def test_find_entry_raises_keyerror_on_unknown_locator():
    entries = Ledger(FIXTURE_LEDGER).load().entries
    with pytest.raises(KeyError):
        find_entry(entries, "id:does-not-exist")


# --- where a directive sits ---


def test_source_of_returns_the_file_and_line_a_directive_was_parsed_from():
    entries = Ledger(FIXTURE_LEDGER).load().entries
    txn = next(e for e in entries if isinstance(e, data.Transaction))

    path, lineno = source_of(txn)

    assert path.is_file()
    # 1-based, so it indexes the file the way an editor numbers it
    assert path.read_text().splitlines()[lineno - 1].startswith(txn.date.isoformat())


def test_source_of_raises_for_a_directive_with_no_source():
    """A synthesized directive — one a `pad` generated — was never parsed from a file."""
    with pytest.raises(KeyError):
        source_of(data.Close({}, None, "Assets:Cash:BankA"))


def test_source_file_is_none_for_a_directive_with_no_source():
    assert source_file(data.Close({}, None, "Assets:Cash:BankA")) is None
