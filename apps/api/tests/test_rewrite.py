"""Boundary-aware ledger text rewriting — the primitive every rename is built from."""

from __future__ import annotations

import textwrap
from pathlib import Path

from yala.ledger.rewrite import (
    block_end,
    changed_only,
    ledger_files,
    remove_blocks,
    rename_accounts,
    rename_meta_in_scope,
    rename_meta_value,
)

OLD = "Assets:Cash:BankA"
NEW = "Assets:Cash:BankZ"


# --- rename_accounts ---


def test_rename_rewrites_directives_and_postings():
    text = textwrap.dedent(f"""\
        2020-01-01 open {OLD} USD
        2026-02-01 balance {OLD}   10.00 USD
        2026-01-31 pad {OLD} Equity:Adjustments:BankA
        2026-02-02 * "spend"
          Expenses:Grocery   5.00 USD
          {OLD}  -5.00 USD
        2026-03-01 close {OLD}
        """)

    out = rename_accounts(text, {OLD: NEW})

    assert OLD not in out
    assert out.count(NEW) == 5


def test_rename_leaves_a_sibling_whose_name_starts_the_same():
    """The trap: a plain substring replace would rewrite the sibling too, silently merging two
    accounts."""
    text = f"{OLD}\nAssets:Cash:BankAB\nAssets:Cash:BankA-Old\n"

    out = rename_accounts(text, {OLD: NEW})

    assert out == f"{NEW}\nAssets:Cash:BankAB\nAssets:Cash:BankA-Old\n"


def test_rename_carries_descendants_along():
    """An account's children move with it, the way what is under a directory moves with it."""
    text = "Assets:Investments:Taxable:Group\nAssets:Investments:Taxable:Group:AcctA\n"

    out = rename_accounts(
        text, {"Assets:Investments:Taxable:Group": "Assets:Investments:Taxable:G"}
    )

    assert out == "Assets:Investments:Taxable:G\nAssets:Investments:Taxable:G:AcctA\n"


def test_rename_rewrites_a_path_inside_a_quoted_meta_value():
    """A sweep destination is a path stored as a string, so it is a reference like any other."""
    text = f'2020-01-01 open Assets:Cash:P USD\n  sweep_to: "{OLD}"\n'

    assert rename_accounts(text, {OLD: NEW}) == (
        f'2020-01-01 open Assets:Cash:P USD\n  sweep_to: "{NEW}"\n'
    )


def test_rename_prefers_the_longer_of_two_overlapping_names():
    text = "Assets:Cash:Bank:Sub\n"

    out = rename_accounts(
        text, {"Assets:Cash:Bank": "Assets:Cash:X", "Assets:Cash:Bank:Sub": "Assets:Cash:Y"}
    )

    assert out == "Assets:Cash:Y\n"


def test_renames_apply_in_one_pass_so_they_cannot_chain():
    """An account and its plug are renamed together; a new name must never be re-matched as an old
    one."""
    text = "Assets:Cash:A\nAssets:Cash:B\n"

    out = rename_accounts(
        text, {"Assets:Cash:A": "Assets:Cash:B", "Assets:Cash:B": "Assets:Cash:C"}
    )

    assert out == "Assets:Cash:B\nAssets:Cash:C\n"


def test_rename_with_nothing_to_do_returns_the_text_unchanged():
    assert rename_accounts("anything", {}) == "anything"


# --- rename_meta_value: deliberately unscoped ---


def test_rename_meta_value_matches_the_whole_value_only():
    """An employer's name scopes accounts all over the ledger, so every one of them is rewritten."""
    text = '  employer: "Employer1"\n  employer: "Employer10"\n  labels: "Employer1"\n'

    out = rename_meta_value(text, "employer", "Employer1", "Employer2")

    assert out == '  employer: "Employer2"\n  employer: "Employer10"\n  labels: "Employer1"\n'


# --- rename_meta_in_scope ---

PLAN_A = "Assets:Investments:TaxAdvantaged:PlanA"
PLAN_B = "Assets:Investments:TaxAdvantaged:PlanB"


def test_rename_meta_in_scope_rewrites_under_the_directive_that_names_the_account():
    text = textwrap.dedent(f"""\
        2020-01-01 open {PLAN_A}
          labels: "OptionA,OptionB"
        2020-01-01 open {PLAN_B}
          labels: "OptionA"
        """)

    out = rename_meta_in_scope(text, PLAN_A, "labels", "OptionA", "OptionZ", listed=True)

    assert f'{PLAN_A}\n  labels: "OptionZ,OptionB"' in out
    assert f'{PLAN_B}\n  labels: "OptionA"' in out


def test_rename_meta_in_scope_rewrites_under_the_posting_that_names_the_account():
    """The same label may name a line item at another account, so the rewrite is scoped by the
    posting it hangs under."""
    text = textwrap.dedent(f"""\
        2026-02-01 * "paycheck"
          Income:Salary:Employer1  -100.00 USD
          {PLAN_A}   40.00 USD
            label: "OptionA"
          {PLAN_B}   60.00 USD
            label: "OptionA"
        """)

    out = rename_meta_in_scope(text, PLAN_A, "label", "OptionA", "OptionZ")

    assert out.count('label: "OptionZ"') == 1
    assert out.count('label: "OptionA"') == 1
    assert f'{PLAN_A}   40.00 USD\n    label: "OptionZ"' in out


def test_rename_meta_in_scope_does_not_carry_across_a_new_entry():
    text = textwrap.dedent(f"""\
        2026-02-01 * "one"
          {PLAN_A}   1.00 USD
        2026-02-02 * "two"
          label: "OptionA"
        """)

    assert rename_meta_in_scope(text, PLAN_A, "label", "OptionA", "OptionZ") == text


def test_rename_meta_in_scope_leaves_a_value_that_lacks_the_item():
    text = f'2020-01-01 open {PLAN_A}\n  labels: "OptionA"\n'

    assert rename_meta_in_scope(text, PLAN_A, "labels", "OptionB", "OptionZ", listed=True) == text


# --- block removal ---


def test_block_end_stops_at_a_blank_or_unindented_line():
    lines = ["a\n", "  m: 1\n", "\n", "b\n"]

    assert block_end(lines, 0) == 2


def test_remove_blocks_drops_a_directive_and_its_metadata():
    text = '2026-01-01 close A\n  closed_with: "B"\n2026-01-02 close C\n'

    assert remove_blocks(text, [1]) == "2026-01-02 close C\n"


def test_remove_blocks_removes_several_bottom_up():
    """Removed from the bottom, so an earlier directive's line number is still valid."""
    text = "one\ntwo\nthree\n"

    assert remove_blocks(text, [1, 3]) == "two\n"


# --- file helpers ---


def test_ledger_files_reads_every_beancount_file_under_the_directory(tmp_path: Path):
    (tmp_path / "sub").mkdir()
    (tmp_path / "main.beancount").write_text("a\n")
    (tmp_path / "sub" / "2026.beancount").write_text("b\n")
    (tmp_path / "notes.txt").write_text("c\n")

    files = ledger_files(tmp_path)

    assert set(files) == {tmp_path / "main.beancount", tmp_path / "sub" / "2026.beancount"}


def test_changed_only_reports_the_files_that_actually_differ():
    before = {Path("a"): "x", Path("b"): "y"}
    after = {Path("a"): "x", Path("b"): "z"}

    assert changed_only(before, after) == {Path("b"): "z"}
