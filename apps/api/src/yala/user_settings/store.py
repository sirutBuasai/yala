"""The user's own settings in one JSON document beside the ledger, not in it, since none of it is
financial record. Shaped as one per-user document so it can become a database row unchanged. Only
what the user changed is stored; defaults stay in code."""

from __future__ import annotations

import json
import threading
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field
from decimal import Decimal
from pathlib import Path

from yala import config
from yala.ledger.files import atomic_write
from yala.user_settings.colors import FAMILIES, parse_color, starting_color
from yala.user_settings.specs import SETTINGS, SETTINGS_BY_KEY, coerce

FILE_NAME = "settings.json"
#: Bumped when the document's shape changes, so an older app refuses to overwrite a newer file.
VERSION = 1
#: A layout is opaque here: the frontend owns its shape and revives whatever it reads back.
MAX_LAYOUT_CHARS = 64_000
MAX_LAYOUT_KEY = 80

_lock = threading.Lock()


def _mapping(value: object) -> dict:
    return value if isinstance(value, dict) else {}


def _number(value: Decimal) -> int | float:
    return int(value) if value == value.to_integral_value() else float(value)


def valid_layout_key(key: object) -> bool:
    return (
        isinstance(key, str)
        and 0 < len(key) <= MAX_LAYOUT_KEY
        and all(c.isascii() and (c.isalnum() or c in "-:") for c in key)
    )


@dataclass
class UserSettings:
    planning: dict[str, Decimal] = field(default_factory=dict)
    colors: dict[str, dict[str, str]] = field(default_factory=lambda: {f: {} for f in FAMILIES})
    layouts: dict[str, object] = field(default_factory=dict)

    @classmethod
    def parse(cls, raw: object) -> UserSettings:
        """Bad entries are dropped one at a time, so one hand edit can't blank the rest."""
        doc = _mapping(raw)
        out = cls()

        for key, value in _mapping(doc.get("planning")).items():
            try:
                out.planning[key] = coerce(key, value)
            except (KeyError, ValueError):
                continue

        colors = _mapping(doc.get("colors"))
        for family in FAMILIES:
            for name, value in _mapping(colors.get(family)).items():
                color = parse_color(value)
                if color and name.strip():
                    out.colors[family][name.strip()] = color

        out.layouts = {k: v for k, v in _mapping(doc.get("layouts")).items() if valid_layout_key(k)}
        return out

    def to_json(self) -> dict:
        return {
            "version": VERSION,
            "planning": {k: _number(v) for k, v in sorted(self.planning.items())},
            "colors": {f: dict(sorted(self.colors[f].items())) for f in FAMILIES},
            "layouts": dict(sorted(self.layouts.items())),
        }

    def planning_values(self) -> dict[str, Decimal | None]:
        """What's stored, else the spec default, which may be None."""
        return {s.key: self.planning.get(s.key, s.default) for s in SETTINGS}

    def set_planning(self, key: str, value: object | None) -> Decimal | None:
        """``None``, or the default itself, removes the figure so it follows the default again.
        Raises ``KeyError`` or ``ValueError``."""
        spec = SETTINGS_BY_KEY.get(key)
        if spec is None:
            raise KeyError(key)
        stored = None if value is None else coerce(key, value)
        if stored is None or stored == spec.default:
            self.planning.pop(key, None)
            return None
        self.planning[key] = stored
        return stored

    def color(self, family: str, name: str) -> str | None:
        """The user's pick, else a category's starting colour. An institution has none."""
        return self.colors[family].get(name) or starting_color(family, name)

    def set_color(self, family: str, name: str, value: str | None) -> str | None:
        """``None``, or a category's starting colour itself, drops the pick. Raises ``ValueError``
        for a family or colour it can't take."""
        if family not in FAMILIES:
            raise ValueError(f"unknown colour family: {family!r}")
        color = None if value is None else parse_color(value)
        if value is not None and color is None:
            raise ValueError(f"colour must be a hex like #rrggbb: {value!r}")
        if color is None or color == starting_color(family, name):
            self.colors[family].pop(name, None)
            return None
        self.colors[family][name] = color
        return color

    def rename(self, family: str, old: str, new: str) -> None:
        """The pick follows a rename, since it is keyed by name."""
        if old in self.colors[family]:
            self.colors[family][new] = self.colors[family].pop(old)

    def set_layout(self, key: str, value: object | None) -> None:
        """``None`` drops the layout, putting the board back on its default."""
        if not valid_layout_key(key):
            raise ValueError(f"invalid layout key: {key!r}")
        if value is None:
            self.layouts.pop(key, None)
            return
        if len(json.dumps(value)) > MAX_LAYOUT_CHARS:
            raise ValueError(f"layout {key!r} is larger than {MAX_LAYOUT_CHARS} characters")
        self.layouts[key] = value


def path_for(main_ledger: Path | None = None) -> Path:
    """Beside the ledger it belongs to, so the two travel together."""
    return (main_ledger or config.MAIN_LEDGER).parent / FILE_NAME


def _load(path: Path) -> dict | None:
    """The raw document, or ``None`` when there is no file yet."""
    try:
        text = path.read_text()
    except FileNotFoundError:
        return None
    return json.loads(text)


def read(main_ledger: Path | None = None) -> UserSettings:
    """Every default when the file is missing or unreadable, so a bad hand edit can't take the app
    down; :func:`editing` refuses to overwrite such a file instead."""
    try:
        return UserSettings.parse(_load(path_for(main_ledger)))
    except (OSError, ValueError):
        return UserSettings()


@contextmanager
def editing(main_ledger: Path | None = None) -> Iterator[UserSettings]:
    """Read, change and write back as one step, so two saves at once can't drop either change.
    Raises ``ValueError`` rather than overwrite a file it can't read or that a newer app wrote."""
    path = path_for(main_ledger)

    with _lock:
        try:
            raw = _load(path)
        except ValueError as e:
            raise ValueError(f"{path.name} is not valid JSON; fix it by hand first ({e})")

        version = _mapping(raw).get("version", VERSION)
        if not isinstance(version, int) or version > VERSION:
            raise ValueError(f"{path.name} was written by a newer version of Yala")

        settings = UserSettings.parse(raw)
        yield settings
        atomic_write(path, json.dumps(settings.to_json(), indent=2) + "\n")
