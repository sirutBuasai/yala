"""Contract model tests."""

from __future__ import annotations

import pytest
from pydantic import ValidationError
from scripts.generate_schema import example_data

from yala.schema import DashboardData


def test_extra_key_is_rejected():
    payload = example_data().model_dump()
    payload["surprise"] = "not allowed"
    with pytest.raises(ValidationError):
        DashboardData(**payload)
