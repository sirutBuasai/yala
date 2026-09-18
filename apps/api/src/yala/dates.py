"""Calendar arithmetic. A leaf module, like :mod:`yala.money`, so anything may import it."""

from __future__ import annotations

import calendar
import datetime as dt


def last_day(year: int, month: int) -> dt.date:
    """The final day of ``month``."""
    return dt.date(year, month, calendar.monthrange(year, month)[1])


def month_bounds(any_day: dt.date) -> tuple[dt.date, dt.date]:
    """``(first, last)`` day of the month ``any_day`` falls in."""
    return any_day.replace(day=1), last_day(any_day.year, any_day.month)
