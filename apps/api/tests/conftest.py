"""Shared test fixtures: a throwaway copy of the fixture ledger, and a client pointed at it.

Every write test needs the same two things — a ledger it may corrupt and a config pointed at it — so
they are declared once here rather than restated per module.
"""

from __future__ import annotations

import shutil
import textwrap
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from yala import config
from yala.api import app
from yala.ledger import Ledger

FIXTURE_LEDGER = Path(__file__).parent / "fixtures" / "ledger"

# The accounts the fixture ledger declares, named once so a change to it is a change in one place.
BANK_A = "Assets:Cash:BankA"
BANK_B = "Assets:Cash:BankB"
WALLET = "Assets:Cash:Wallet"
PASSTHROUGH = "Assets:Cash:Passthrough"
SAVINGS = "Assets:Cash:Savings"  # the passthrough's sweep destination
CARD_A = "Liabilities:CC:CardA"
CARD_B = "Liabilities:CC:CardB"
CARD_C = "Liabilities:CC:CardC"  # opened late, so it carries no activity
CARD_CLOSED = "Liabilities:CC:CardD"
EMPLOYER = "Income:Salary:Employer1"
EMPLOYER_GONE = "Income:Salary:Employer2"  # closed, its plan accounts left open
SCOPED_DEDUCTION = "Expenses:Deductions:Employer1Benefit"
GENERIC_DEDUCTION = "Expenses:Deductions:Tax"  # no employer meta: offered by every employer
K401 = "Assets:Investments:TaxAdvantaged:Employer401k"
HSA = "Assets:Investments:TaxAdvantaged:Broker1HSA"
LEGACY_PLAN = "Assets:Investments:TaxAdvantaged:LegacyPlan"  # closed


@pytest.fixture
def ledger_dir(tmp_path: Path) -> Path:
    """A writable copy of the fixture ledger."""
    dst = tmp_path / "ledger"
    shutil.copytree(FIXTURE_LEDGER, dst)
    return dst


@pytest.fixture
def client(ledger_dir: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    """A client whose API writes land in ``ledger_dir``, carried on the client for convenience."""
    monkeypatch.setattr(config, "LEDGER_DIR", ledger_dir)
    monkeypatch.setattr(config, "MAIN_LEDGER", ledger_dir / "main.beancount")
    c = TestClient(app)
    c.ledger_dir = ledger_dir  # type: ignore[attr-defined]
    return c


def load_ledger(ledger_dir: Path) -> Ledger:
    """The ledger at ``ledger_dir``, loaded strictly — the state a write left behind."""
    led = Ledger(Path(ledger_dir) / "main.beancount", strict=True).load()
    assert led.errors == []
    return led


def append_accounts(ledger_dir: Path, text: str) -> None:
    """Append dedented text to the fixture's account declarations."""
    path = Path(ledger_dir) / "accounts.beancount"
    path.write_text(path.read_text() + textwrap.dedent(text))
