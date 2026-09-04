"""User settings: the spec table, the ledger reader, the ``set_setting`` write, and the endpoint."""

from __future__ import annotations

import datetime as dt
import shutil
from decimal import Decimal
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from yala import config
from yala.api import app
from yala.builder import build
from yala.ledger import Ledger
from yala.ledger.settings import SETTINGS, SETTINGS_BY_KEY, coerce
from yala.schema import SettingsSection
from yala.sink import SETTINGS_FILE, FileLedgerSink

FIXTURE_LEDGER = Path(__file__).parent / "fixtures" / "ledger"
JAN = dt.date(2026, 1, 1)


@pytest.fixture
def ledger_dir(tmp_path: Path) -> Path:
    dst = tmp_path / "ledger"
    shutil.copytree(FIXTURE_LEDGER, dst)
    return dst


def _load(ledger_dir: Path) -> Ledger:
    led = Ledger(ledger_dir / "main.beancount", strict=True).load()
    assert led.errors == []
    return led


# --- the spec is the single source of truth ---


def test_contract_fields_match_the_setting_specs():
    """The contract section and the spec table must not drift: every setting is a field, and every
    field is a setting (hyphens in a key become underscores in the field name)."""
    assert {s.key.replace("-", "_") for s in SETTINGS} == set(SettingsSection.model_fields)


def test_only_defaultless_settings_are_optional_in_the_contract():
    """A setting with a default is always present; one without is nullable, so a feature that needs
    it can hide rather than guess."""
    for spec in SETTINGS:
        field = SettingsSection.model_fields[spec.key.replace("-", "_")]
        assert (field.default is None) == (spec.default is None), spec.key


# --- coerce (shared by reader, sink, and API) ---


def test_coerce_accepts_in_range_values():
    assert coerce("swr", 3.5) == Decimal("3.5")
    assert coerce("retire-age", 55) == Decimal(55)


def test_coerce_rejects_an_unknown_key():
    with pytest.raises(KeyError):
        coerce("not-a-setting", 1)


@pytest.mark.parametrize(
    "key,value,message",
    [
        ("swr", 99, "between"),
        ("swr", 0, "between"),
        ("retire-age", 55.5, "whole number"),
        ("birth-year", "abc", "must be a number"),
        ("swr", float("inf"), "finite"),
    ],
)
def test_coerce_rejects_bad_values(key: str, value: object, message: str):
    with pytest.raises(ValueError, match=message):
        coerce(key, value)


def test_coerce_error_names_the_field_label():
    with pytest.raises(ValueError, match="Target retirement age"):
        coerce("retire-age", 5)


# --- reading from the ledger ---


def test_values_fall_back_to_defaults_when_nothing_is_set(ledger_dir: Path):
    values = _load(ledger_dir).settings.values()
    assert values["swr"] == SETTINGS_BY_KEY["swr"].default
    assert values["birth-year"] is None  # no default → stays unset
    assert set(values) == {s.key for s in SETTINGS}


def test_stored_reads_only_what_the_ledger_states(ledger_dir: Path):
    FileLedgerSink(ledger_dir).set_setting("swr", 3.5, JAN)
    assert _load(ledger_dir).settings.stored() == {"swr": Decimal("3.5")}


def test_a_later_directive_supersedes_an_earlier_one(ledger_dir: Path):
    sink = FileLedgerSink(ledger_dir)
    sink.set_setting("swr", 4.0, JAN)
    sink.set_setting("swr", 3.0, dt.date(2026, 6, 1))

    # Both lines survive as history; the latest wins.
    assert (ledger_dir / SETTINGS_FILE).read_text().count('"swr"') == 2
    assert _load(ledger_dir).settings.values()["swr"] == Decimal("3.0")


def test_a_malformed_directive_is_skipped_rather_than_fatal(ledger_dir: Path):
    """The ledger is hand-editable, so one bad settings line must not blank the dashboard."""
    path = ledger_dir / SETTINGS_FILE
    path.write_text(
        f'{JAN} custom "yala-setting" "swr" 3.5\n'
        f'{JAN} custom "yala-setting" "swr" 999\n'  # out of range
        f'{JAN} custom "yala-setting" "bogus-key" 1\n'  # unknown
        f'{JAN} custom "yala-setting" "swr"\n'  # missing value
    )
    (ledger_dir / "main.beancount").write_text(
        (ledger_dir / "main.beancount").read_text() + f'\ninclude "{SETTINGS_FILE}"\n'
    )

    assert _load(ledger_dir).settings.values()["swr"] == Decimal("3.5")


# --- writing ---


def test_set_setting_wires_the_include_and_writes_the_directive(ledger_dir: Path):
    FileLedgerSink(ledger_dir).set_setting("retire-age", 55, JAN)

    assert (ledger_dir / SETTINGS_FILE).read_text().strip() == (
        f'{JAN} custom "yala-setting" "retire-age" 55'
    )
    assert f'include "{SETTINGS_FILE}"' in (ledger_dir / "main.beancount").read_text()


def test_set_setting_rewrites_a_same_date_directive_in_place(ledger_dir: Path):
    sink = FileLedgerSink(ledger_dir)
    sink.set_setting("swr", 4.0, JAN)
    sink.set_setting("swr", 3.25, JAN)

    text = (ledger_dir / SETTINGS_FILE).read_text()
    assert text.count('"swr"') == 1  # same-day fiddling doesn't pile up
    assert "3.25" in text


def test_set_setting_writes_an_age_without_a_decimal_point(ledger_dir: Path):
    FileLedgerSink(ledger_dir).set_setting("retire-age", 60.0, JAN)
    assert '"retire-age" 60' in (ledger_dir / SETTINGS_FILE).read_text()


def test_set_setting_rejects_a_bad_value_without_touching_the_ledger(ledger_dir: Path):
    with pytest.raises(ValueError):
        FileLedgerSink(ledger_dir).set_setting("swr", 50, JAN)
    assert not (ledger_dir / SETTINGS_FILE).exists()


# --- the contract ---


def test_builder_emits_effective_settings(ledger_dir: Path):
    FileLedgerSink(ledger_dir).set_setting("birth-year", 1996, JAN)
    section = build(_load(ledger_dir)).settings

    assert section is not None
    assert section.birth_year == 1996
    assert section.swr == float(SETTINGS_BY_KEY["swr"].default)


# --- the endpoint ---


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    ledger_dir = tmp_path / "ledger"
    shutil.copytree(FIXTURE_LEDGER, ledger_dir)
    monkeypatch.setattr(config, "LEDGER_DIR", ledger_dir)
    monkeypatch.setattr(config, "MAIN_LEDGER", ledger_dir / "main.beancount")
    return TestClient(app)


def test_get_settings_returns_values_and_specs(client: TestClient):
    body = client.get("/api/settings").json()

    assert body["values"]["swr"] == float(SETTINGS_BY_KEY["swr"].default)
    assert {s["key"] for s in body["specs"]} == {s.key for s in SETTINGS}
    # the form renders from the spec, so bounds and help must travel with it
    swr = next(s for s in body["specs"] if s["key"] == "swr")
    assert swr["max"] == 20 and swr["help"]


def test_post_setting_persists_and_shows_in_data(client: TestClient):
    r = client.post("/api/settings", json={"key": "swr", "value": 3.5})
    assert r.status_code == 200, r.text

    assert client.get("/api/settings").json()["values"]["swr"] == 3.5
    assert client.get("/api/data").json()["settings"]["swr"] == 3.5


def test_post_setting_rejects_an_out_of_range_value(client: TestClient):
    r = client.post("/api/settings", json={"key": "swr", "value": 99})
    assert r.status_code == 422
    assert "between" in r.json()["detail"]


def test_post_setting_rejects_an_unknown_key(client: TestClient):
    """A key no spec defines is a malformed request, so it names the offending key at 422."""
    r = client.post("/api/settings", json={"key": "nope", "value": 1})
    assert r.status_code == 422
    assert r.json()["detail"] == "unknown setting: 'nope'"
