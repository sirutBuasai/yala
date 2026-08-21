"""Contract model tests."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from scripts.generate_schema import example_data
from yala.schema import SCHEMA_VERSION, DashboardData


def test_example_data_validates():
    data = example_data()
    assert isinstance(data, DashboardData)
    assert data.schema_version == 1


def test_schema_version_is_one():
    assert SCHEMA_VERSION == 1
    assert example_data().schema_version == SCHEMA_VERSION


def test_extra_key_is_rejected():
    payload = example_data().model_dump()
    payload["surprise"] = "not allowed"
    with pytest.raises(ValidationError):
        DashboardData(**payload)
