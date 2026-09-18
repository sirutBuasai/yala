"""User settings: the few figures the ledger can't derive."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter
from pydantic import BaseModel, Field

from yala.catalog import setting_fields
from yala.ledger.settings import SETTINGS_BY_KEY
from yala.routes.common import ledger, ok, sink
from yala.routes.errors import api_errors, invalid

router = APIRouter()


class SettingIn(BaseModel):
    key: str
    value: Annotated[float, Field(allow_inf_nan=False)]


@router.get("/api/settings")
def get_settings() -> dict:
    """Effective settings plus the spec behind each one, so the form renders its own labels, help,
    bounds, and defaults instead of restating them in the frontend."""
    values = ledger().settings.values()
    return {
        "values": {k: (None if v is None else float(v)) for k, v in values.items()},
        # One implementation, shared with the snapshot (see `yala.catalog.setting_fields`).
        "specs": [f.model_dump(mode="json") for f in setting_fields()],
    }


@router.post("/api/settings")
def post_setting(body: SettingIn) -> dict:
    """Set one user setting. Bounds and whole-number rules come from the setting's spec, so the
    ledger and the form enforce exactly the same thing."""
    spec = SETTINGS_BY_KEY.get(body.key)
    if spec is None:
        # A bad key is a malformed request, not a missing resource: the client sent a name no
        # version of this app defines, so 404 would suggest a setting that could exist.
        raise invalid(f"unknown setting: {body.key!r}")

    with api_errors():
        stored = sink().set_setting(body.key, body.value)

    return ok(f"{spec.label} set", key=body.key, value=float(stored))
