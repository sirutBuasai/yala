"""User settings: the spec table, the JSON store, and the endpoints."""

from __future__ import annotations

import json
from decimal import Decimal
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from yala.builder import build
from yala.ledger import Ledger
from yala.schema import SettingsSection
from yala.user_settings import editing, path_for, read
from yala.user_settings.specs import SETTINGS, SETTINGS_BY_KEY, coerce


def _main(ledger_dir: Path) -> Path:
    return ledger_dir / "main.beancount"


def _write(ledger_dir: Path, doc: object) -> None:
    path_for(_main(ledger_dir)).write_text(json.dumps(doc))


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


# --- coerce (shared by the store and the API) ---


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


# --- the store ---


def test_values_fall_back_to_defaults_when_nothing_is_set(ledger_dir: Path):
    values = read(_main(ledger_dir)).planning_values()
    assert values["swr"] == SETTINGS_BY_KEY["swr"].default
    assert values["birth-year"] is None  # no default → stays unset
    assert set(values) == {s.key for s in SETTINGS}


def test_only_what_the_user_changed_is_written(ledger_dir: Path):
    """Defaults stay in code, so a default that later changes reaches anyone who never set it."""
    with editing(_main(ledger_dir)) as settings:
        settings.set_planning("retire-age", 55.0)

    doc = json.loads(path_for(_main(ledger_dir)).read_text())
    assert doc["planning"] == {"retire-age": 55}
    assert doc["version"] == 1


def test_setting_none_puts_a_figure_back_on_its_default(ledger_dir: Path):
    with editing(_main(ledger_dir)) as settings:
        settings.set_planning("swr", 3.0)
    with editing(_main(ledger_dir)) as settings:
        settings.set_planning("swr", None)

    assert read(_main(ledger_dir)).planning_values()["swr"] == SETTINGS_BY_KEY["swr"].default


def _stored(ledger_dir: Path) -> dict:
    return json.loads(path_for(_main(ledger_dir)).read_text())


def test_changing_then_resetting_leaves_nothing_stored(client: TestClient):
    """A reset removes the value, so the file only ever holds what differs from the default."""
    client.post("/api/settings", json={"key": "swr", "value": 3.5})
    client.post("/api/color", json={"family": "categories", "name": "Grocery", "color": "#abcdef"})
    client.post("/api/layout", json={"key": "board-home-2", "value": [1]})
    assert _stored(client.ledger_dir)["planning"] == {"swr": 3.5}  # type: ignore[attr-defined]

    client.post("/api/settings", json={"key": "swr", "value": None})
    client.post("/api/color", json={"family": "categories", "name": "Grocery", "color": None})
    client.post("/api/layout", json={"key": "board-home-2", "value": None})

    doc = _stored(client.ledger_dir)  # type: ignore[attr-defined]
    assert doc["planning"] == {} and doc["colors"]["categories"] == {} and doc["layouts"] == {}


def test_setting_the_default_itself_stores_nothing(client: TestClient):
    """Typing the default back in is a reset too, so a later default change still reaches it."""
    client.post("/api/settings", json={"key": "swr", "value": 3.5})
    r = client.post("/api/settings", json={"key": "swr", "value": 4})
    client.post("/api/color", json={"family": "categories", "name": "Grocery", "color": "#F295C5"})

    assert r.json()["value"] == 4.0
    doc = _stored(client.ledger_dir)  # type: ignore[attr-defined]
    assert doc["planning"] == {} and doc["colors"]["categories"] == {}


def test_a_rejected_value_writes_nothing(ledger_dir: Path):
    with pytest.raises(ValueError), editing(_main(ledger_dir)) as settings:
        settings.set_planning("swr", 50)
    assert not path_for(_main(ledger_dir)).exists()


def test_a_malformed_entry_is_skipped_rather_than_fatal(ledger_dir: Path):
    """The file is hand-editable, so one bad entry must not blank the rest."""
    _write(
        ledger_dir,
        {
            "planning": {"swr": 3.5, "retire-age": 999, "bogus": 1},
            "colors": {"institutions": {"BankA": "#ABC", "BankB": "red"}, "categories": []},
            "layouts": {"board-x": [1], "Bad Key": [2]},
        },
    )

    settings = read(_main(ledger_dir))
    assert settings.planning == {"swr": Decimal("3.5")}
    assert settings.colors["institutions"] == {"BankA": "#aabbcc"}
    assert settings.layouts == {"board-x": [1]}


def test_an_unreadable_file_reads_as_defaults_but_is_never_overwritten(ledger_dir: Path):
    path = path_for(_main(ledger_dir))
    path.write_text("{ not json")

    assert read(_main(ledger_dir)).planning == {}
    with pytest.raises(ValueError, match="not valid JSON"), editing(_main(ledger_dir)):
        pass
    assert path.read_text() == "{ not json"


def test_a_file_from_a_newer_version_is_never_overwritten(ledger_dir: Path):
    _write(ledger_dir, {"version": 99})
    with pytest.raises(ValueError, match="newer version"), editing(_main(ledger_dir)):
        pass


def test_a_category_starts_on_its_default_colour_and_an_institution_on_none(ledger_dir: Path):
    settings = read(_main(ledger_dir))
    assert settings.color("categories", "Grocery") == "#f295c5"
    assert settings.color("institutions", "BankA") is None


# --- the contract ---


def test_builder_emits_effective_settings_and_layouts(ledger_dir: Path):
    _write(ledger_dir, {"planning": {"birth-year": 1996}, "layouts": {"board-home-2": []}})
    doc = build(Ledger(_main(ledger_dir)).load())

    assert doc.settings is not None
    assert doc.settings.birth_year == 1996
    assert doc.settings.swr == float(SETTINGS_BY_KEY["swr"].default)
    assert doc.layouts == {"board-home-2": []}


def test_the_directory_carries_category_and_institution_colours(client: TestClient):
    _write(client.ledger_dir, {"colors": {"categories": {"Grocery": "#123456"}}})  # type: ignore[attr-defined]

    accounts = client.get("/api/data").json()["meta"]["accounts"]
    assert accounts["Expenses:Grocery"]["color"] == "#123456"
    assert accounts["Expenses:Takeouts"]["color"] == "#bb9af7"
    assert accounts["Expenses:Grocery"]["default_color"] == "#f295c5"
    assert accounts["Assets:Cash:BankA"]["default_color"] is None


# --- the endpoint ---


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


def test_post_setting_with_no_value_resets_to_the_default(client: TestClient):
    client.post("/api/settings", json={"key": "planned-spending", "value": 50000})
    r = client.post("/api/settings", json={"key": "planned-spending", "value": None})
    assert r.status_code == 200, r.text

    assert client.get("/api/settings").json()["values"]["planned-spending"] is None
    assert client.get("/api/data").json()["settings"]["planned_spending"] is None


def test_post_setting_rejects_an_out_of_range_value(client: TestClient):
    r = client.post("/api/settings", json={"key": "swr", "value": 99})
    assert r.status_code == 422
    assert "between" in r.json()["detail"]


def test_post_setting_rejects_an_unknown_key(client: TestClient):
    """A key no spec defines is a malformed request, so it names the offending key at 422."""
    r = client.post("/api/settings", json={"key": "nope", "value": 1})
    assert r.status_code == 422
    assert r.json()["detail"] == "unknown setting: 'nope'"


def test_post_color_sets_and_resets_a_category(client: TestClient):
    r = client.post(
        "/api/color", json={"family": "categories", "name": "Grocery", "color": "#ABCDEF"}
    )
    assert r.status_code == 200, r.text
    assert r.json()["color"] == "#abcdef"
    accounts = client.get("/api/data").json()["meta"]["accounts"]
    assert accounts["Expenses:Grocery"]["color"] == "#abcdef"

    r = client.post("/api/color", json={"family": "categories", "name": "Grocery", "color": None})
    assert r.json()["color"] == "#f295c5"


def test_post_color_refuses_a_name_the_ledger_does_not_have(client: TestClient):
    r = client.post("/api/color", json={"family": "categories", "name": "Nope", "color": "#abcdef"})
    assert r.status_code == 422


def test_post_color_refuses_anything_but_a_hex_literal(client: TestClient):
    r = client.post(
        "/api/color", json={"family": "categories", "name": "Grocery", "color": "red; x: y"}
    )
    assert r.status_code == 422


def test_post_layout_stores_and_drops_a_board(client: TestClient):
    panes = [{"id": "a", "x": 0, "y": 0, "w": 4, "h": 4, "mode": "fixed", "cap": 4}]
    assert (
        client.post("/api/layout", json={"key": "board-home-2", "value": panes}).status_code == 200
    )
    assert client.get("/api/data").json()["layouts"] == {"board-home-2": panes}

    client.post("/api/layout", json={"key": "board-home-2", "value": None})
    assert client.get("/api/data").json()["layouts"] == {}


def test_post_layout_refuses_a_bad_key(client: TestClient):
    r = client.post("/api/layout", json={"key": "../x", "value": []})
    assert r.status_code == 422
