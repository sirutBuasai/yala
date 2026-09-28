"""User settings: planning figures the ledger can't derive, colours, and board layouts, all kept in
the settings file beside the ledger rather than in it."""

from __future__ import annotations

from typing import Annotated, Any, Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field

from yala.catalog import color_key, setting_fields
from yala.routes.common import MAX_TEXT, ledger, ok
from yala.routes.errors import api_errors, invalid
from yala.user_settings import editing, read
from yala.user_settings.specs import SETTINGS_BY_KEY

router = APIRouter()


class SettingIn(BaseModel):
    key: str
    #: ``None`` puts the setting back on its default, which for a derived figure means following the
    #: ledger again.
    value: Annotated[float, Field(allow_inf_nan=False)] | None


@router.get("/api/settings")
def get_settings() -> dict:
    """Effective settings plus the spec behind each one, so the form renders its own labels, help,
    bounds, and defaults instead of restating them in the frontend."""
    values = read().planning_values()
    return {
        "values": {k: (None if v is None else float(v)) for k, v in values.items()},
        # One implementation, shared with the snapshot (see `yala.catalog.setting_fields`).
        "specs": [f.model_dump(mode="json") for f in setting_fields()],
    }


@router.post("/api/settings")
def post_setting(body: SettingIn) -> dict:
    """Set one user setting. Bounds and whole-number rules come from the setting's spec, so the
    store and the form enforce exactly the same thing."""
    spec = SETTINGS_BY_KEY.get(body.key)
    if spec is None:
        # A bad key is a malformed request, not a missing resource: the client sent a name no
        # version of this app defines, so 404 would suggest a setting that could exist.
        raise invalid(f"unknown setting: {body.key!r}")

    with api_errors(), editing() as settings:
        stored = settings.set_planning(body.key, body.value)

    if stored is None:
        default = None if spec.default is None else float(spec.default)
        return ok(f"{spec.label} reset to default", key=body.key, value=default)
    return ok(f"{spec.label} set", key=body.key, value=float(stored))


class ColorIn(BaseModel):
    family: Literal["institutions", "categories"]
    name: Annotated[str, Field(min_length=1, max_length=MAX_TEXT)]
    #: ``None`` drops the pick: a category goes back to its starting colour, an institution to none.
    color: str | None


@router.post("/api/color")
def post_color(body: ColorIn) -> dict:
    """Only a name the ledger has can be coloured, so the file never collects stray keys."""
    known = {color_key(a, meta) for a, meta in ledger().account_meta().items()}
    if (body.family, body.name) not in known:
        raise invalid(f"no account in {body.family} is named {body.name!r}")

    with api_errors(), editing() as settings:
        stored = settings.set_color(body.family, body.name, body.color)
        effective = settings.color(body.family, body.name)

    verb = "reset" if stored is None else "set"
    return ok(f"{body.name} colour {verb}", family=body.family, name=body.name, color=effective)


class LayoutIn(BaseModel):
    key: str
    #: ``None`` drops the stored layout, putting the board back on its default.
    value: Any = None


@router.post("/api/layout")
def post_layout(body: LayoutIn) -> dict:
    with api_errors(), editing() as settings:
        settings.set_layout(body.key, body.value)
    return ok(f"layout {body.key} saved", key=body.key)
