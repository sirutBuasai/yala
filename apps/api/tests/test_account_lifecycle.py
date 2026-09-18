"""The rest of the account lifecycle over HTTP: opening the six kinds, editing what an account is
called, closing it with its guards and cascades, and reopening it."""

from __future__ import annotations

import datetime as dt
from pathlib import Path

import pytest
from beancount.core import data
from fastapi.testclient import TestClient

from tests.conftest import (
    BANK_A,
    BANK_B,
    CARD_A,
    CARD_C,
    EMPLOYER,
    GENERIC_DEDUCTION,
    HSA,
    K401,
    PASSTHROUGH,
    SAVINGS,
    SCOPED_DEDUCTION,
    load_ledger,
)

TODAY = dt.date.today().isoformat()


def _open(client: TestClient, kind: str, **body):
    return client.post("/api/account", json={"kind": kind, **body})


def _close(client: TestClient, account: str, **body):
    return client.post("/api/account/close", json={"account": account, **body})


def _reopen(client: TestClient, account: str):
    return client.post("/api/account/reopen", json={"account": account})


def _led(client: TestClient):
    return load_ledger(client.ledger_dir)  # type: ignore[attr-defined]


def _open_entry(client: TestClient, account: str) -> data.Open:
    return next(
        e for e in _led(client).entries if isinstance(e, data.Open) and e.account == account
    )


# --- opening the new kinds ---


def test_open_an_employer(client: TestClient):
    """A new job: the account paychecks are logged against."""
    r = _open(client, "employer", name="EmployerZ")

    assert r.status_code == 200, r.text
    assert r.json()["account"] == "Income:Salary:EmployerZ"
    assert "EmployerZ" in client.get("/api/accounts").json()["employers"]


def test_a_new_employer_can_be_paid_immediately(client: TestClient):
    _open(client, "employer", name="EmployerZ")

    r = client.post(
        "/api/paycheck",
        json={"employer": "EmployerZ", "gross": 1000.0, "deposit_account": BANK_B},
    )

    assert r.status_code == 200, r.text


def test_open_a_generic_deduction(client: TestClient):
    r = _open(client, "deduction", name="Dental")

    assert r.status_code == 200, r.text
    assert r.json()["account"] == "Expenses:Deductions:Dental"
    option = next(
        o for o in client.get("/api/accounts").json()["payroll_options"] if o["label"] == "Dental"
    )
    assert option["kind"] == "deduction" and option["employer"] is None


def test_open_an_employer_scoped_deduction(client: TestClient):
    r = _open(client, "deduction", name="Parking", employer="Employer1")

    assert r.status_code == 200, r.text
    option = next(
        o for o in client.get("/api/accounts").json()["payroll_options"] if o["label"] == "Parking"
    )
    assert option["employer"] == "Employer1"


def test_a_deduction_is_not_a_spending_category(client: TestClient):
    _open(client, "deduction", name="Dental")

    assert "Deductions:Dental" not in client.get("/api/accounts").json()["spending_categories"]


def test_open_a_bank_account_gets_a_plug_and_a_genesis_assertion(client: TestClient):
    """Without a plug there is nothing for a snapshot to pad into, which silently made a new bank
    account impossible to log a balance for."""
    assert _open(client, "bank", name="BankZ").status_code == 200

    account, plug = "Assets:Cash:BankZ", "Equity:Adjustments:BankZ"
    led = _led(client)
    assert plug in led.active_accounts()
    assert any(isinstance(e, data.Balance) and e.account == account for e in led.entries)
    assert account in client.get("/api/accounts").json()["balance_accounts"]


def test_a_new_bank_accounts_balance_can_be_logged(client: TestClient):
    """The end of the same bug: the account is loggable the day after it opens, since a snapshot
    pads the day before the date it asserts."""
    _open(client, "bank", name="BankZ", date="2026-03-01")

    r = client.post(
        "/api/balance",
        json={"account": "Assets:Cash:BankZ", "amount": 250.0, "date": "2026-03-02"},
    )

    assert r.status_code == 200, r.text


@pytest.mark.parametrize(
    "kind,name", [("card", "CardZ"), ("category", "Gifts"), ("employer", "EmployerZ")]
)
def test_a_kind_with_nothing_to_pad_gets_no_plug(client: TestClient, kind: str, name: str):
    assert _open(client, kind, name=name).status_code == 200

    plugs = [a for a in _led(client).declared_accounts("Equity:Adjustments:") if name in a]
    assert plugs == []


def test_open_takes_a_date_and_defaults_to_today(client: TestClient):
    _open(client, "bank", name="BankY", date="2026-04-05")
    _open(client, "bank", name="BankZ")

    assert _open_entry(client, "Assets:Cash:BankY").date == dt.date(2026, 4, 5)
    assert _open_entry(client, "Assets:Cash:BankZ").date == dt.date.today()


def test_the_plug_opens_no_later_than_the_account_it_serves(client: TestClient):
    _open(client, "bank", name="BankZ", date="2026-04-05")

    assert _open_entry(client, "Equity:Adjustments:BankZ").date == dt.date(2026, 4, 5)


def test_an_out_of_range_open_date_is_refused(client: TestClient):
    r = _open(client, "bank", name="BankZ", date="1800-01-01")

    assert r.status_code == 422
    assert "date must be between" in r.json()["detail"]


def test_opening_a_name_the_ledger_already_declares_is_refused(client: TestClient):
    """Beancount rejects a second ``open``, so without a guard here the caller gets a parser message
    for a request that is simply a duplicate."""
    r = _open(client, "bank", name="BankA")

    assert r.status_code == 422
    assert r.json()["detail"] == f"{BANK_A} already exists"


def test_opening_a_closed_account_says_to_reopen_it(client: TestClient):
    """The only thing the caller needs to know: it exists and reopening is the operation, since a
    second ``open`` can never be written."""
    r = _open(client, "card", name="CardD")

    assert r.status_code == 422
    assert "/api/account/reopen" in r.json()["detail"]


def test_two_typed_names_composing_to_one_path_is_refused(client: TestClient):
    """Different words, one composed name. The second is a duplicate however differently it was
    typed, and it is reported as one rather than as a broken ledger."""
    assert (
        _open(client, "card", institution_name="Bank of Z", account_name="Cash Rewards").status_code
        == 200
    )

    r = _open(client, "card", institution_name="Bank of Z Cash", account_name="Rewards")

    assert r.status_code == 422
    assert "already exists" in r.json()["detail"]


def test_a_failed_open_does_not_disclose_where_the_ledger_lives(client: TestClient):
    """Error detail is shown in the browser, and beancount stamps absolute paths into its own
    messages."""
    r = _open(client, "bank", name="BankA")

    assert str(client.ledger_dir) not in r.text  # type: ignore[attr-defined]


def test_a_new_account_inherits_the_institutions_short_form(client: TestClient):
    """A short form belongs to the institution, not to one account held there, so an account that
    joins one and does not restate it would leave that institution reading two ways."""
    _open(client, "bank", institution_name="Bank of Z", institution_alias="BoZ")

    r = _open(client, "card", institution_name="Bank of Z", account_name="Cash Rewards")

    assert r.status_code == 200, r.text
    entry = client.get("/api/data").json()["meta"]["accounts"][r.json()["account"]]
    assert entry["institution_alias"] == "BoZ"
    assert r.json()["name"] == "BoZ Cash Rewards"


def test_a_new_account_may_override_the_inherited_short_form(client: TestClient):
    _open(client, "bank", institution_name="Bank of Z", institution_alias="BoZ")

    r = _open(
        client,
        "card",
        institution_name="Bank of Z",
        account_name="Cash Rewards",
        institution_alias="BZ",
    )

    accounts = client.get("/api/data").json()["meta"]["accounts"]
    assert accounts[r.json()["account"]]["institution_alias"] == "BZ"


# --- descriptive metadata ---


def _meta(client: TestClient, account: str, **body):
    return client.post("/api/account/meta", json={"account": account, **body})


def test_editing_the_aliases_shortens_the_name_without_renaming_the_account(client: TestClient):
    """An account's displayed name derives from its leaf; the aliases only shorten it when a row is
    too narrow. Editing them is not a rename, and the account path must not move."""
    _open(client, "card", institution_name="Bank of Example", account_name="Cash Rewards")
    account = "Liabilities:CC:BankOfExampleCashRewards"

    r = _meta(client, account, institution_alias="BoE")

    assert r.status_code == 200, r.text
    assert r.json()["name"] == "BoE Cash Rewards"
    assert account in _led(client).active_accounts()


def test_clearing_an_alias_restores_the_full_name(client: TestClient):
    _open(
        client,
        "card",
        institution_name="Bank of Example",
        account_name="Cash Rewards",
        institution_alias="BoE",
    )
    account = "Liabilities:CC:BankOfExampleCashRewards"

    r = _meta(client, account, institution_alias=None)

    assert r.status_code == 200, r.text
    assert r.json()["name"] == "Bank of Example Cash Rewards"


def test_an_alias_is_held_to_the_same_name_rule(client: TestClient):
    """An alias stands in for the name, so it may say no more than the name may."""
    _open(client, "card", institution_name="Bank of Example", account_name="Cash Rewards")

    r = _meta(client, "Liabilities:CC:BankOfExampleCashRewards", institution_alias='BoE "X"')

    assert r.status_code == 422
    assert "institution_alias can only contain" in r.json()["detail"]


def test_a_field_the_request_leaves_out_is_left_alone(client: TestClient):
    _open(
        client,
        "card",
        institution_name="Bank of Example",
        account_name="Cash Rewards",
        institution_alias="BoE",
    )
    account = "Liabilities:CC:BankOfExampleCashRewards"

    _meta(client, account, account_alias="Cash")

    entry = client.get("/api/data").json()["meta"]["accounts"][account]
    assert entry["institution_alias"] == "BoE"
    assert entry["account_alias"] == "Cash"


def test_linking_an_investment_to_an_employer_makes_it_contributable(client: TestClient):
    """The `employer` meta's presence *is* the payroll-contributable marker."""
    _open(client, "investment", tier="Taxable", name="PlanZ")
    account = "Assets:Investments:Taxable:PlanZ"

    r = _meta(client, account, employer="Employer1", labels=["OptionA"])

    assert r.status_code == 200, r.text
    options = client.get("/api/accounts").json()["payroll_options"]
    linked = next(o for o in options if o["account"] == account)
    assert linked["kind"] == "contribution" and linked["employer"] == "Employer1"


def test_unlinking_an_investment_stops_offering_it(client: TestClient):
    r = _meta(client, K401, employer=None)

    assert r.status_code == 200, r.text
    options = client.get("/api/accounts").json()["payroll_options"]
    assert not any(o["account"] == K401 for o in options)


def test_labels_can_be_added_and_removed(client: TestClient):
    r = _meta(client, K401, labels=["Roth401k", "OptionZ"])

    assert r.status_code == 200, r.text
    assert r.json()["labels"] == ["Roth401k", "OptionZ"]
    labels = {o["label"] for o in client.get("/api/accounts").json()["payroll_options"]}
    assert "OptionZ" in labels and "Trad401k" not in labels


def test_linking_to_an_unknown_employer_is_refused(client: TestClient):
    r = _meta(client, K401, employer="EmployerGhost")

    assert r.status_code == 422
    assert "unknown or inactive employer" in r.json()["detail"]


@pytest.mark.parametrize(
    "account,field,value",
    [
        (BANK_A, "employer", "Employer1"),
        (BANK_A, "labels", ["OptionA"]),
        (BANK_A, "account_alias", "Checking"),
        (EMPLOYER, "institution_alias", "E1"),
    ],
)
def test_metadata_the_kind_cannot_carry_is_refused(
    client: TestClient, account: str, field: str, value: object
):
    r = _meta(client, account, **{field: value})

    assert r.status_code == 422
    assert f"{field} does not apply" in r.json()["detail"]


def test_an_empty_metadata_edit_is_refused(client: TestClient):
    r = _meta(client, BANK_A)

    assert r.status_code == 422
    assert "no metadata" in r.json()["detail"]


def test_metadata_on_a_closed_account_is_refused(client: TestClient):
    r = _meta(client, "Liabilities:CC:CardD", institution_alias="Old")

    assert r.status_code == 422
    assert "closed" in r.json()["detail"]


def test_a_newline_in_a_metadata_value_is_collapsed(client: TestClient):
    """Beancount accepts a raw newline inside a quoted string, so the strict reload cannot catch
    one; the sanitising validator is what does."""
    r = _meta(client, BANK_A, institution_alias="Bank\nOf A")

    assert r.status_code == 200, r.text
    entry = client.get("/api/data").json()["meta"]["accounts"][BANK_A]
    assert entry["institution_alias"] == "Bank Of A"


def test_the_institution_cannot_be_edited_as_metadata(client: TestClient):
    """It names the account, so changing it is a rename — editing it here would let the stored name
    and the institution it was composed from drift apart."""
    r = _meta(client, BANK_A, institution_name="Bank Of A")

    assert r.status_code == 422
    assert "rename" in r.json()["detail"]


# --- closing: guards ---


def test_closing_an_account_others_sweep_into_is_refused_and_names_them(client: TestClient):
    r = _close(client, SAVINGS)

    assert r.status_code == 422
    assert PASSTHROUGH in r.json()["detail"]
    assert SAVINGS in client.get("/api/accounts").json()["cash_accounts"]


def test_a_card_holding_a_balance_cannot_be_closed(client: TestClient):
    """A liability is discharged by paying it, and that payment is a real bill-pay entry with its
    own date and funding account. Closing must not invent one."""
    client.post(
        "/api/transaction",
        json={
            "date": "2026-02-10",
            "payee": "spend",
            "amount": 40.0,
            "category": "Takeouts",
            "funding_account": CARD_A,
        },
    )

    r = _close(client, CARD_A, date="2026-02-11")

    assert r.status_code == 422
    assert "pay it off" in r.json()["detail"]
    assert CARD_A in client.get("/api/accounts").json()["card_accounts"]


def test_a_paid_off_card_closes(client: TestClient):
    r = _close(client, CARD_C)

    assert r.status_code == 200, r.text
    assert CARD_C not in client.get("/api/accounts").json()["card_accounts"]


def test_a_card_close_takes_no_destination(client: TestClient):
    r = _close(client, CARD_C, destination=BANK_A)

    assert r.status_code == 422
    assert "destination" in r.json()["detail"]


def test_closing_a_bank_account_closes_its_plug(client: TestClient):
    """A reopen has to be able to bring both back, so the retirement takes both away."""
    assert _close(client, BANK_A).status_code == 200

    assert "Equity:Adjustments:BankA" not in _led(client).active_accounts()


def test_closing_an_already_closed_account_is_refused(client: TestClient):
    r = _close(client, "Liabilities:CC:CardD")

    assert r.status_code == 422
    assert "closed" in r.json()["detail"]


# --- closing: what goes with an employer ---


def test_closing_an_employer_says_what_it_has_to_decide_about(client: TestClient):
    """Nothing follows an employer out by itself, and unlinking is too consequential to infer from
    an omitted field, so the request has to say."""
    r = _close(client, EMPLOYER, date="2026-08-25")

    assert r.status_code == 422
    assert SCOPED_DEDUCTION in r.json()["detail"]
    assert K401 in r.json()["detail"]
    assert EMPLOYER in _led(client).active_accounts()


def test_closing_an_employer_closes_what_the_request_names(client: TestClient):
    r = _close(client, EMPLOYER, date="2026-08-25", close_with=[SCOPED_DEDUCTION])

    assert r.status_code == 200, r.text
    assert r.json()["also"] == [SCOPED_DEDUCTION]
    active = _led(client).active_accounts()
    assert SCOPED_DEDUCTION not in active
    assert EMPLOYER not in active


def test_a_close_that_follows_the_employer_records_what_triggered_it(client: TestClient):
    _close(client, EMPLOYER, date="2026-08-25", close_with=[SCOPED_DEDUCTION])

    close = next(
        e
        for e in _led(client).entries
        if isinstance(e, data.Close) and e.account == SCOPED_DEDUCTION
    )
    assert close.meta["closed_with"] == EMPLOYER


def test_an_account_left_open_is_unlinked_from_the_employer(client: TestClient):
    """A job that has ended cannot go on scoping payroll line items, so what stays open stops being
    the employer's."""
    r = _close(client, EMPLOYER, date="2026-08-25", close_with=[SCOPED_DEDUCTION])

    assert set(r.json()["unlinked"]) == {K401, HSA}
    accounts = client.get("/api/data").json()["meta"]["accounts"]
    assert accounts[K401]["employer"] is None and accounts[HSA]["employer"] is None
    assert K401 in _led(client).active_accounts()


def test_an_unlinked_account_keeps_its_name(client: TestClient):
    """Its name records where the plan came from, which stays true; renaming it is a separate
    decision."""
    _close(client, EMPLOYER, date="2026-08-25", close_with=[])

    assert K401 in _led(client).declared_accounts()
    assert client.get("/api/data").json()["meta"]["accounts"][K401]["labels"] == [
        "Roth401k",
        "Trad401k",
        "AfterTax401k",
    ]


def test_closing_an_employer_with_an_empty_list_unlinks_everything(client: TestClient):
    r = _close(client, EMPLOYER, date="2026-08-25", close_with=[])

    assert r.status_code == 200, r.text
    assert r.json()["also"] == []
    assert set(r.json()["unlinked"]) == {SCOPED_DEDUCTION, K401, HSA}


def test_closing_an_employer_alongside_an_account_it_does_not_hold_is_refused(client: TestClient):
    r = _close(client, EMPLOYER, date="2026-08-25", close_with=[GENERIC_DEDUCTION])

    assert r.status_code == 422
    assert "not linked" in r.json()["detail"]
    assert EMPLOYER in _led(client).active_accounts()


def test_a_plan_still_holding_value_cannot_be_closed_with_the_employer(client: TestClient):
    """A bare close would drop its value off the sheet with no entry saying where it went."""
    client.post(
        "/api/paycheck",
        json={
            "employer": "Employer1",
            "gross": 1000.0,
            "deposit_account": BANK_B,
            "contributions": [{"label": "Roth401k", "amount": 100.0}],
        },
    )

    r = _close(client, EMPLOYER, date="2026-08-25", close_with=[K401])

    assert r.status_code == 422
    assert "retire it" in r.json()["detail"]


def test_a_closed_employer_offers_no_payroll_options(client: TestClient):
    _close(client, EMPLOYER, date="2026-08-25", close_with=[SCOPED_DEDUCTION])

    body = client.get("/api/accounts").json()
    assert body["employers"] == []
    assert not any(o["employer"] == "Employer1" for o in body["payroll_options"])


# --- reopening ---


def test_reopening_a_category_brings_it_back_to_the_pickers(client: TestClient):
    _open(client, "category", name="Gifts")
    _close(client, "Expenses:Gifts")

    r = _reopen(client, "Expenses:Gifts")

    assert r.status_code == 200, r.text
    assert "Gifts" in client.get("/api/accounts").json()["spending_categories"]


def test_reopening_deletes_the_close_rather_than_adding_a_second_open(client: TestClient):
    """Beancount rejects a duplicate ``open``, so an undo cannot be a further entry. The ``close``
    carries no money, so deleting it loses nothing."""
    _open(client, "category", name="Gifts")
    _close(client, "Expenses:Gifts")

    _reopen(client, "Expenses:Gifts")

    entries = _led(client).entries
    assert (
        sum(1 for e in entries if isinstance(e, data.Open) and e.account == "Expenses:Gifts") == 1
    )
    assert not any(isinstance(e, data.Close) and e.account == "Expenses:Gifts" for e in entries)


def test_reopening_a_bank_account_brings_its_plug_back(client: TestClient):
    _close(client, BANK_A)

    r = _reopen(client, BANK_A)

    assert r.status_code == 200, r.text
    assert set(r.json()["reopened"]) == {BANK_A, "Equity:Adjustments:BankA"}
    assert BANK_A in client.get("/api/accounts").json()["balance_accounts"]


def test_a_reopened_account_can_be_logged_again(client: TestClient):
    _close(client, BANK_A)
    _reopen(client, BANK_A)

    r = client.post("/api/balance", json={"account": BANK_A, "amount": 100.0, "date": "2026-09-01"})

    assert r.status_code == 200, r.text


def test_rehiring_an_employer_brings_back_what_closed_with_it(client: TestClient):
    _close(client, EMPLOYER, date="2026-08-25", close_with=[SCOPED_DEDUCTION])

    r = _reopen(client, EMPLOYER)

    assert r.status_code == 200, r.text
    assert set(r.json()["reopened"]) == {EMPLOYER, SCOPED_DEDUCTION}
    assert SCOPED_DEDUCTION in _led(client).active_accounts()


def test_a_rehire_leaves_a_deduction_that_was_closed_on_its_own_account(client: TestClient):
    _close(client, GENERIC_DEDUCTION, date="2026-08-24")
    _close(client, EMPLOYER, date="2026-08-25", close_with=[SCOPED_DEDUCTION])

    _reopen(client, EMPLOYER)

    assert GENERIC_DEDUCTION not in _led(client).active_accounts()


def test_a_rehire_leaves_an_unlinked_account_unlinked(client: TestClient):
    """Whether a past job's plan belongs to the next one is not something a reopen can know, so it
    stays unlinked until someone says otherwise."""
    _close(client, EMPLOYER, date="2026-08-25", close_with=[])

    r = _reopen(client, EMPLOYER)

    assert r.json()["reopened"] == [EMPLOYER]
    assert client.get("/api/data").json()["meta"]["accounts"][K401]["employer"] is None


def test_a_reopened_employer_offers_its_options_again(client: TestClient):
    _close(client, EMPLOYER, date="2026-08-25", close_with=[SCOPED_DEDUCTION])
    _reopen(client, EMPLOYER)

    body = client.get("/api/accounts").json()
    assert body["employers"] == ["Employer1"]
    assert any(o["label"] == "Employer1Benefit" for o in body["payroll_options"])


def test_reopening_an_open_account_is_refused(client: TestClient):
    r = _reopen(client, BANK_A)

    assert r.status_code == 422
    assert "already open" in r.json()["detail"]


def test_reopening_an_unknown_account_is_404(client: TestClient):
    r = _reopen(client, "Assets:Cash:Ghost")

    assert r.status_code == 404


def test_reopening_an_unmanaged_account_is_refused(client: TestClient):
    r = _reopen(client, "Equity:Opening-Balances")

    assert r.status_code == 422
    assert "manageable" in r.json()["detail"]


# --- sweep rules ---


def _sweep(client: TestClient, account: str, dest: str | None):
    return client.post("/api/account/sweep", json={"account": account, "dest": dest})


def test_a_sweep_may_land_in_an_investment(client: TestClient):
    r = _sweep(client, BANK_B, K401)

    assert r.status_code == 200, r.text


def test_only_a_cash_account_can_be_a_passthrough(client: TestClient):
    """A card's balance is what is owed, not money sitting in the wrong place."""
    r = _sweep(client, CARD_A, BANK_B)

    assert r.status_code == 422
    assert "cash account" in r.json()["detail"]


def test_a_card_is_not_a_sweep_destination(client: TestClient):
    r = _sweep(client, BANK_B, CARD_A)

    assert r.status_code == 422
    assert "cash or investment" in r.json()["detail"]


def test_a_category_is_not_a_sweep_destination(client: TestClient):
    r = _sweep(client, BANK_B, "Expenses:Grocery")

    assert r.status_code == 422


# --- multi-file atomicity ---


def test_a_rename_that_would_break_the_ledger_rolls_every_file_back(
    client: TestClient, ledger_dir: Path
):
    """The existing rollback covered one file; a rename spans many, and half of one is worse than
    none."""
    before = {p: p.read_text() for p in sorted(ledger_dir.glob("**/*.beancount"))}

    # BankB is already declared, so the rewrite would produce a duplicate open.
    assert (
        client.post("/api/account/rename", json={"account": BANK_A, "name": "BankB"}).status_code
        == 422
    )

    assert {p: p.read_text() for p in sorted(ledger_dir.glob("**/*.beancount"))} == before


def test_bare_closing_a_passthrough_mid_month_retires_its_sweep(client: TestClient):
    """The month-end sweep would fall after the close, so it has to go with the passthrough whether
    or not the close drains a balance."""
    client.post(
        "/api/transaction",
        json={
            "date": "2026-02-10",
            "payee": "spend",
            "amount": 30.0,
            "category": "Takeouts",
            "funding_account": PASSTHROUGH,
        },
    )
    assert (
        client.post(
            "/api/account/close", json={"account": PASSTHROUGH, "destination": SAVINGS}
        ).status_code
        == 200
    )


def test_renaming_a_closed_employer_keeps_its_closes_intact(client: TestClient):
    """The marker holds the employer's account path, so a rename has to carry it too — and a later
    rehire still finds the accounts its close took out."""
    _close(client, EMPLOYER, date="2026-08-25", close_with=[SCOPED_DEDUCTION])

    assert (
        client.post(
            "/api/account/rename", json={"account": EMPLOYER, "name": "EmployerZ"}
        ).status_code
        == 200
    )

    renamed = "Income:Salary:EmployerZ"
    r = _reopen(client, renamed)
    assert r.status_code == 200, r.text
    assert SCOPED_DEDUCTION in r.json()["reopened"]


def test_reopening_a_passthrough_leaves_its_sweep_unset(client: TestClient):
    """Closing a passthrough clears its `sweep_to`; a reopen brings the account back, not the
    configuration, so the destination is chosen again deliberately."""
    _close(client, PASSTHROUGH)
    _reopen(client, PASSTHROUGH)

    body = client.get("/api/accounts").json()
    assert PASSTHROUGH in body["cash_accounts"]
    assert PASSTHROUGH not in body["sweeps"]


def test_a_bank_has_no_account_half_to_shorten(client: TestClient):
    """A cash account is named by institution alone, so an account short form has nothing to stand
    in for — and stored, it would leak into the displayed name."""
    r = _meta(client, BANK_A, account_alias="Checking")

    assert r.status_code == 422
    assert "account_alias does not apply" in r.json()["detail"]


def test_opening_a_bank_with_an_account_half_is_refused(client: TestClient):
    r = _open(client, "bank", institution_name="Bank Z", account_name="Checking")

    assert r.status_code == 422
    assert "account_name does not apply" in r.json()["detail"]


def test_a_bank_balance_can_be_split_across_destinations(client: TestClient):
    """The same division an investment gets: one leg is the single-destination case, several are
    not."""
    client.post("/api/balance", json={"account": BANK_A, "amount": 300.0, "date": "2026-02-10"})

    r = _close(
        client,
        BANK_A,
        date="2026-02-11",
        legs=[
            {"destination": BANK_B, "amount": 200.0},
            {"destination": "Assets:Cash:Wallet", "amount": 100.0},
        ],
    )

    assert r.status_code == 200, r.text
    led = _led(client)
    assert BANK_A not in led.active_accounts()
    assert led.balance(BANK_B, None) != 0
    assert led.balance("Assets:Cash:Wallet", None) != 0


def test_a_split_that_misses_the_bank_balance_is_refused(client: TestClient):
    client.post("/api/balance", json={"account": BANK_A, "amount": 300.0, "date": "2026-02-10"})

    r = _close(client, BANK_A, date="2026-02-11", legs=[{"destination": BANK_B, "amount": 250.0}])

    assert r.status_code == 422
    assert "must sum to" in r.json()["detail"]
    assert BANK_A in _led(client).active_accounts()


def test_a_card_cannot_be_split(client: TestClient):
    """A liability is discharged by paying it, so there is nothing to divide up."""
    r = _close(client, CARD_C, legs=[{"destination": BANK_A, "amount": 10.0}])

    assert r.status_code == 422
    assert "legs does not apply" in r.json()["detail"]


def test_a_close_cannot_ask_for_a_destination_and_a_split_at_once(client: TestClient):
    """A bank account takes either, so sending both is a contradiction rather than a preference:
    one would silently win."""
    r = _close(
        client,
        BANK_A,
        destination=BANK_B,
        legs=[{"destination": "Assets:Cash:Wallet", "amount": 1.0}],
    )

    assert r.status_code == 422
    assert "either one destination or split destinations" in r.json()["detail"]


@pytest.mark.parametrize(
    "extra",
    [{"destination": SAVINGS}, {"legs": [{"destination": SAVINGS, "amount": 30.0}]}],
    ids=["drained", "split"],
)
def test_closing_a_passthrough_retires_its_sweep_whichever_route_it_takes(
    client: TestClient, extra: dict
):
    """A sweep is dated month-end, so closing earlier in the month would leave a transfer against
    a closed account. Every route reads the balance after retiring, so all see the same figure.
    """
    client.post(
        "/api/transfer",
        json={
            "date": "2026-02-10",
            "from_account": BANK_B,
            "to_account": PASSTHROUGH,
            "amount": 30.0,
        },
    )

    r = _close(client, PASSTHROUGH, date="2026-02-12", **extra)

    assert r.status_code == 200, r.text
    assert float(r.json()["moved"]) == 30.0
    assert PASSTHROUGH not in client.get("/api/accounts").json()["sweeps"]


def test_a_bare_close_clears_the_passthrough_configuration_too(client: TestClient):
    r = _close(client, PASSTHROUGH)

    assert r.status_code == 200, r.text
    assert PASSTHROUGH not in client.get("/api/accounts").json()["sweeps"]
