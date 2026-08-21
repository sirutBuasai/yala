"""Builder tests over the fixture ledger."""

from __future__ import annotations

from pathlib import Path

from yala.builder import _income, _meta, build
from yala.ledger import Ledger

FIXTURE_MAIN = Path(__file__).parent / "fixtures" / "ledger" / "main.beancount"


def _data():
    return build(Ledger(FIXTURE_MAIN).load())


def _handles():
    ledger = Ledger(FIXTURE_MAIN).load()
    spending, income = ledger.spending, ledger.income
    categories = spending.categories()
    income_months = {(p.date.year, p.date.month) for p in income.paychecks()}
    all_months = sorted(set(spending.months()) | income_months)
    all_years = sorted(set(spending.years()) | set(income.years()))
    return spending, income, categories, all_years, all_months


def test_canonical_sections_present():
    d = _data()
    assert d.schema_version == 1
    assert d.currency == "USD"
    assert d.overview.by_year
    assert set(d.years) == {"2025", "2026"}
    assert "2025-08" in d.months and "2026-01" in d.months
    assert d.income.by_year


def test_meta_reflects_ledger():
    d = _data()
    assert d.meta.transaction_count == 5
    assert d.meta.categories == ["Grocery", "Subscription", "Takeouts"]
    assert d.meta.years == [2025, 2026]


def test_domains_flags():
    dm = _data().meta.domains
    assert dm.spending is True
    assert dm.income is True
    assert dm.networth is False
    assert dm.investments is False
    assert dm.cards is False


def test_matrix_has_twelve_rows():
    for page in _data().years.values():
        assert len(page.matrix) == 12
        assert [r.month for r in page.matrix] == list(range(1, 13))
        for row in page.matrix:
            # spent is a category -> amount map, non-zero only
            assert isinstance(row.spent, dict)
            assert all(v != 0 for v in row.spent.values())
            assert set(row.spent) <= {"Grocery", "Subscription", "Takeouts"}


def test_matrix_spent_maps_categories_and_omits_zeros():
    d = _data()
    aug = next(r for r in d.years["2025"].matrix if r.month == 8)
    # month total equals the sum of the mapped category amounts
    assert round(sum(aug.spent.values()), 2) == round(d.months["2025-08"].total_spent, 2)
    # only non-zero categories are present
    assert all(v != 0 for v in aug.spent.values())


def test_income_year_deductions_populated():
    for iy in _data().income.by_year:
        assert iy.deductions > 0
        assert round(iy.deductions, 2) == round(iy.gross - iy.net, 2)


def test_overview_saved_is_income_minus_spent():
    for ys in _data().overview.by_year:
        assert round(ys.saved, 2) == round(ys.income - ys.spent, 2)


def test_paychecks_carry_locator():
    d = _data()
    paychecks = [p for mp in d.months.values() for p in mp.paychecks]
    assert paychecks
    assert all(p.locator for p in paychecks)
    assert all(p.locator for p in d.income.recent_paychecks)


def test_meta_helper_independently():
    spending, income, categories, all_years, all_months = _handles()
    meta = _meta(spending, income, categories, all_years, all_months)
    assert meta.transaction_count == 5
    assert meta.categories == ["Grocery", "Subscription", "Takeouts"]
    assert meta.domains.income is True


def test_income_helper_independently():
    _, income, *_ = _handles()
    section = _income(income)
    assert section.by_year
    assert all(iy.gross >= iy.net for iy in section.by_year)
    # no cap: recent_paychecks holds every paycheck, most recent first
    assert len(section.recent_paychecks) == len(income.paychecks())
    dates = [p.date for p in section.recent_paychecks]
    assert dates == sorted(dates, reverse=True)


def test_reserved_sections_empty():
    d = _data()
    assert d.networth is None
    assert d.investments is None
    assert d.cards == []
