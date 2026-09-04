"""Ledger-location config: env override and derived paths."""

from __future__ import annotations

import importlib

import yala.config as config


def _reload():
    importlib.reload(config)
    return config


def test_env_var_overrides_ledger_dir(monkeypatch, tmp_path):
    monkeypatch.setenv("YALA_LEDGER_DIR", str(tmp_path))
    cfg = _reload()

    assert cfg.LEDGER_DIR == tmp_path
    assert cfg.MAIN_LEDGER == tmp_path / "main.beancount"


def test_paths_derive_from_ledger_dir_by_default(monkeypatch):
    monkeypatch.delenv("YALA_LEDGER_DIR", raising=False)
    cfg = _reload()

    assert cfg.MAIN_LEDGER == cfg.LEDGER_DIR / "main.beancount"
