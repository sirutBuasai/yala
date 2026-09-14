"""Renaming and moving accounts: one operation that rewrites every reference across every file.

It serves four user-facing actions — fix a mistyped category, rename an account, move an investment
between tax tiers, rename an employer — plus renaming a contribution label, which rewrites the
label's own history for the same reason.
"""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from tests.conftest import (
    BANK_A,
    BANK_B,
    EMPLOYER,
    K401,
    PASSTHROUGH,
    SAVINGS,
    append_accounts,
    load_ledger,
)


def _rename(client: TestClient, account: str, **body):
    return client.post("/api/account/rename", json={"account": account, **body})


def _text(client: TestClient) -> str:
    """Every ledger file's text at once, for asserting that no stale reference is left anywhere."""
    root: Path = client.ledger_dir  # type: ignore[attr-defined]
    return "".join(p.read_text() for p in sorted(root.glob("**/*.beancount")))


# --- rename ---


def test_rename_a_category_rewrites_its_history(client: TestClient):
    client.post(
        "/api/transaction",
        json={
            "payee": "lunch",
            "amount": 12.0,
            "category": "Takeouts",
            "funding_account": "Liabilities:CC:CardA",
        },
    )

    r = _rename(client, "Expenses:Takeouts", name="Dining")

    assert r.status_code == 200, r.text
    assert r.json()["account"] == "Expenses:Dining"
    assert "Expenses:Takeouts" not in _text(client)
    # the history moved with the name, so the spend still counts
    cats = client.get("/api/accounts").json()["spending_categories"]
    assert "Dining" in cats and "Takeouts" not in cats


def test_rename_a_bank_account_carries_its_plug(client: TestClient):
    """The plug is derived from the account's path, so leaving it behind would strand every future
    snapshot with nowhere to pad."""
    client.post("/api/balance", json={"account": BANK_A, "amount": 500.0, "date": "2026-02-10"})

    r = _rename(client, BANK_A, name="BankZ")

    assert r.status_code == 200, r.text
    led = load_ledger(client.ledger_dir)  # type: ignore[attr-defined]
    assert "Assets:Cash:BankZ" in led.active_accounts()
    assert "Equity:Adjustments:BankZ" in led.active_accounts()
    assert "Equity:Adjustments:BankA" not in led.declared_accounts()
    assert led.balance("Assets:Cash:BankZ", None) != 0  # the snapshot followed it


def test_rename_rewrites_a_sweep_destination_stored_as_a_string(client: TestClient):
    r = _rename(client, SAVINGS, name="Reserve")

    assert r.status_code == 200, r.text
    sweeps = client.get("/api/accounts").json()["sweeps"]
    assert sweeps[PASSTHROUGH] == "Assets:Cash:Reserve"


def test_rename_leaves_a_sibling_with_a_shared_prefix_alone(client: TestClient):
    append_accounts(
        client.ledger_dir,  # type: ignore[attr-defined]
        """
        2020-01-01 open Assets:Cash:BankAExtra USD
        2020-01-01 open Equity:Adjustments:BankAExtra
        """,
    )

    assert _rename(client, BANK_A, name="BankZ").status_code == 200
    led = load_ledger(client.ledger_dir)  # type: ignore[attr-defined]

    assert "Assets:Cash:BankAExtra" in led.active_accounts()
    assert "Equity:Adjustments:BankAExtra" in led.active_accounts()


def test_moving_an_investment_between_tiers_repoints_its_plug(client: TestClient):
    r = _rename(client, K401, tier="Taxable")

    assert r.status_code == 200, r.text
    assert r.json()["account"] == "Assets:Investments:Taxable:Employer401k"
    led = load_ledger(client.ledger_dir)  # type: ignore[attr-defined]
    assert "Equity:Adjustments:Investments:Taxable:Employer401k" in led.active_accounts()
    assert (
        "Equity:Adjustments:Investments:TaxAdvantaged:Employer401k" not in led.declared_accounts()
    )
    # the account keeps its allocation bucket honest
    buckets = {
        a["account"]: a["bucket"] for a in client.get("/api/data").json()["networth"]["accounts"]
    }
    assert buckets["Assets:Investments:Taxable:Employer401k"] == "Taxable"


def test_moving_an_investment_can_rename_and_retier_at_once(client: TestClient):
    r = _rename(client, K401, tier="Taxable", name="PlanZ")

    assert r.status_code == 200, r.text
    assert r.json()["account"] == "Assets:Investments:Taxable:PlanZ"


def test_renaming_an_employer_rewrites_the_scoping_metadata_too(client: TestClient):
    """The name is duplicated — once as the account path, once as the bare string that scopes
    contributions and deductions to it. Rewriting one alone silently unlinks them."""
    r = _rename(client, EMPLOYER, name="EmployerZ")

    assert r.status_code == 200, r.text
    body = client.get("/api/accounts").json()

    assert body["employers"] == ["EmployerZ"]
    contributions = [o for o in body["payroll_options"] if o["kind"] == "contribution"]
    assert contributions and all(o["employer"] == "EmployerZ" for o in contributions)
    scoped = [o for o in body["payroll_options"] if o["label"] == "Employer1Benefit"]
    assert scoped and scoped[0]["employer"] == "EmployerZ"
    assert '"Employer1"' not in _text(client)


def test_renaming_an_employer_keeps_its_paychecks_loadable(client: TestClient):
    before = client.get("/api/data").json()["income"]["by_year"]

    assert _rename(client, EMPLOYER, name="EmployerZ").status_code == 200

    assert client.get("/api/data").json()["income"]["by_year"] == before


def test_rename_onto_an_existing_name_is_refused(client: TestClient):
    r = _rename(client, BANK_A, name="BankB")

    assert r.status_code == 422
    assert "already exists" in r.json()["detail"]
    assert BANK_A in client.get("/api/accounts").json()["cash_accounts"]


def test_renaming_one_employer_onto_another_is_refused(client: TestClient):
    r = _rename(client, EMPLOYER, name="Employer2")

    assert r.status_code == 422
    assert "merge" in r.json()["detail"]


def test_rename_of_an_unmanaged_account_is_refused(client: TestClient):
    r = _rename(client, "Equity:Opening-Balances", name="Genesis")

    assert r.status_code == 422
    assert "manageable" in r.json()["detail"]


def test_rename_with_neither_a_name_nor_a_tier_is_refused(client: TestClient):
    r = _rename(client, BANK_A)

    assert r.status_code == 422
    assert "new name" in r.json()["detail"]


def test_a_tier_move_is_refused_for_an_account_that_has_no_tier(client: TestClient):
    r = _rename(client, BANK_A, tier="Taxable")

    assert r.status_code == 422
    assert "tax tier" in r.json()["detail"]


def test_rename_composes_a_typed_name(client: TestClient):
    """The same rule as opening: a space is fine, the server composes the leaf."""
    r = _rename(client, BANK_A, name="Bank Z")

    assert r.status_code == 200, r.text
    assert r.json()["account"] == "Assets:Cash:BankZ"


def test_rename_to_a_name_that_composes_to_nothing_is_refused(client: TestClient):
    r = _rename(client, BANK_A, name="!!!")

    assert r.status_code == 422
    assert "name can only contain" in r.json()["detail"]


def test_a_rejected_rename_leaves_every_file_untouched(client: TestClient):
    """A rename spans files, so a refusal has to be all-or-nothing."""
    before = _text(client)

    assert _rename(client, BANK_A, name="BankB").status_code == 422

    assert _text(client) == before


def test_rename_of_a_closed_account_still_works(client: TestClient):
    """A closed account keeps appearing in historical rows, so a mistyped one is still worth
    fixing."""
    r = _rename(client, "Liabilities:CC:CardD", name="CardOld")

    assert r.status_code == 200, r.text
    assert "Liabilities:CC:CardD" not in _text(client)


# --- label rename ---


def _relabel(client: TestClient, account: str, old: str, new: str):
    return client.post("/api/account/relabel", json={"account": account, "old": old, "new": new})


def test_relabel_rewrites_the_offer_and_the_history(client: TestClient):
    """The label lives in the account's `labels` meta and on every contribution logged under it;
    rewriting only the first would split one line item's history in two."""
    client.post(
        "/api/paycheck",
        json={
            "employer": "Employer1",
            "gross": 1000.0,
            "contributions": {"Roth401k": 100.0},
            "deposit_account": BANK_B,
        },
    )

    r = _relabel(client, K401, "Roth401k", "RothPlan")

    assert r.status_code == 200, r.text
    labels = {o["label"] for o in client.get("/api/accounts").json()["payroll_options"]}
    assert "RothPlan" in labels and "Roth401k" not in labels

    contributions = client.get("/api/data").json()["income"]["recent_paychecks"][0]["contributions"]
    assert "RothPlan" in contributions and "Roth401k" not in contributions


def test_relabel_leaves_the_same_label_at_another_account_alone(client: TestClient):
    append_accounts(
        client.ledger_dir,  # type: ignore[attr-defined]
        """
        2020-01-01 open Assets:Investments:TaxAdvantaged:PlanB
          labels: "Roth401k"
          employer: "Employer1"
        2020-01-01 open Equity:Adjustments:Investments:TaxAdvantaged:PlanB
        """,
    )

    assert _relabel(client, K401, "Roth401k", "RothPlan").status_code == 200

    options = client.get("/api/accounts").json()["payroll_options"]
    by_account = {
        o["account"]: o["label"] for o in options if o["label"] in {"Roth401k", "RothPlan"}
    }
    assert by_account["Assets:Investments:TaxAdvantaged:PlanB"] == "Roth401k"
    assert by_account[K401] == "RothPlan"


def test_relabel_to_a_label_the_account_already_offers_is_refused(client: TestClient):
    r = _relabel(client, K401, "Roth401k", "Trad401k")

    assert r.status_code == 422
    assert "already offers" in r.json()["detail"]


def test_relabel_a_label_the_account_does_not_offer_is_refused(client: TestClient):
    r = _relabel(client, K401, "Nope", "RothPlan")

    assert r.status_code == 422
    assert "no label" in r.json()["detail"]


def test_relabel_on_an_account_that_offers_no_labels_is_refused(client: TestClient):
    r = _relabel(client, BANK_A, "Roth401k", "RothPlan")

    assert r.status_code == 422
    assert "contribution labels" in r.json()["detail"]


# --- renaming the institution ---


def _held_at(client: TestClient, institution: str) -> tuple[str, str]:
    """A bank and a card opened at ``institution``, named the way the open form names them."""
    bank = client.post(
        "/api/account", json={"kind": "bank", "institution_name": institution}
    ).json()["account"]
    card = client.post(
        "/api/account",
        json={"kind": "card", "institution_name": institution, "account_name": "Cash Rewards"},
    ).json()["account"]

    return bank, card


def test_renaming_an_institution_renames_every_account_held_there(client: TestClient):
    """The institution's name is duplicated into every leaf composed from it, so all of them move
    together or the institution is split in two."""
    bank, card = _held_at(client, "Bank of Example")

    r = _rename(client, bank, institution_name="BoE")

    assert r.status_code == 200, r.text
    assert r.json()["account"] == "Assets:Cash:BoE"
    assert r.json()["also"] == ["Equity:Adjustments:BoE", "Liabilities:CC:BoECashRewards"]
    declared = load_ledger(client.ledger_dir).declared_accounts()  # type: ignore[attr-defined]
    assert "Liabilities:CC:BoECashRewards" in declared
    assert bank not in declared and card not in declared


def test_renaming_an_institution_carries_the_metadata_with_it(client: TestClient):
    bank, _ = _held_at(client, "Bank of Example")

    _rename(client, bank, institution_name="BoE")

    accounts = client.get("/api/data").json()["meta"]["accounts"]
    assert accounts["Assets:Cash:BoE"]["institution_name"] == "BoE"
    assert accounts["Liabilities:CC:BoECashRewards"]["institution_name"] == "BoE"
    assert "Bank of Example" not in _text(client)


def test_renaming_an_institution_carries_its_colour_swatch(client: TestClient):
    """The swatch keys the colour by the institution's name, so leaving it behind would strand the
    colour on a name no account carries."""
    bank, _ = _held_at(client, "Bank of Example")
    append_accounts(
        client.ledger_dir,  # type: ignore[attr-defined]
        '\n2026-01-01 custom "yala-institution" "Bank of Example" "#abcdef"\n',
    )

    _rename(client, bank, institution_name="BoE")

    assert client.get("/api/data").json()["meta"]["accounts"]["Assets:Cash:BoE"]["color"] == (
        "#abcdef"
    )


def test_renaming_an_institution_onto_a_declared_one_is_refused(client: TestClient):
    bank, _ = _held_at(client, "Bank of Example")
    _held_at(client, "Other Bank")

    r = _rename(client, bank, institution_name="Other Bank")

    assert r.status_code == 422
    assert "merge" in r.json()["detail"]


def test_renaming_an_institution_carries_a_closed_account_too(client: TestClient):
    """A closed account's leaf still names the institution; skipping it would leave the old name in
    the history."""
    bank, card = _held_at(client, "Bank of Example")
    assert client.post("/api/account/close", json={"account": card}).status_code == 200

    _rename(client, bank, institution_name="BoE")

    assert (
        "Liabilities:CC:BoECashRewards"
        in load_ledger(
            client.ledger_dir  # type: ignore[attr-defined]
        ).declared_accounts()
    )


def test_an_account_not_named_after_its_institution_keeps_its_leaf(client: TestClient):
    """A plan named for the employer that sponsors it but held at a custodian. Its leaf was never
    composed from the institution, so only the metadata follows — the name is not guessed at."""
    bank, _ = _held_at(client, "Bank of Example")
    append_accounts(
        client.ledger_dir,  # type: ignore[attr-defined]
        """
        2020-01-01 open Assets:Investments:TaxAdvantaged:SponsoredPlan
          institution_name: "Bank of Example"
        """,
    )

    _rename(client, bank, institution_name="BoE")
    accounts = client.get("/api/data").json()["meta"]["accounts"]

    assert accounts["Assets:Investments:TaxAdvantaged:SponsoredPlan"]["institution_name"] == "BoE"


def test_naming_the_institution_of_an_account_that_declares_none_records_it(client: TestClient):
    """A hand-written account joins the scheme: one rename, and the institution is now on file."""
    r = _rename(client, BANK_A, institution_name="Bank of Example")

    assert r.status_code == 200, r.text
    assert r.json()["account"] == "Assets:Cash:BankOfExample"
    accounts = client.get("/api/data").json()["meta"]["accounts"]
    assert accounts["Assets:Cash:BankOfExample"]["institution_name"] == "Bank of Example"


def test_renaming_the_product_half_keeps_the_institution_half(client: TestClient):
    _, card = _held_at(client, "Bank of Example")

    r = _rename(client, card, account_name="Travel")

    assert r.status_code == 200, r.text
    assert r.json()["account"] == "Liabilities:CC:BankOfExampleTravel"


def test_a_bank_has_no_product_half_to_rename(client: TestClient):
    r = _rename(client, BANK_A, account_name="Savings")

    assert r.status_code == 422
    assert "account_name does not apply" in r.json()["detail"]


def test_a_category_has_no_institution(client: TestClient):
    r = _rename(client, "Expenses:Grocery", institution_name="Bank of Example")

    assert r.status_code == 422
    assert "institution_name does not apply" in r.json()["detail"]


def test_renaming_two_parts_of_a_name_at_once_is_refused(client: TestClient):
    _, card = _held_at(client, "Bank of Example")

    r = _rename(client, card, institution_name="BoE", account_name="Travel")

    assert r.status_code == 422
    assert "one part" in r.json()["detail"]


def test_the_institution_short_form_is_set_on_every_account_held_there(client: TestClient):
    """It shortens the institution's name, which is one name however many accounts carry it, so
    editing it on one account and not the others would make one institution read two ways."""
    bank, card = _held_at(client, "Bank of Example")

    r = client.post("/api/account/meta", json={"account": bank, "institution_alias": "BoE"})

    assert r.status_code == 200, r.text
    assert r.json()["also"] == [card]
    accounts = client.get("/api/data").json()["meta"]["accounts"]
    assert accounts[bank]["institution_alias"] == "BoE"
    assert accounts[card]["institution_alias"] == "BoE"


def test_the_product_short_form_stays_on_its_own_account(client: TestClient):
    bank, card = _held_at(client, "Bank of Example")

    r = client.post("/api/account/meta", json={"account": card, "account_alias": "Cash"})

    assert r.status_code == 200, r.text
    assert r.json()["also"] == []
    accounts = client.get("/api/data").json()["meta"]["accounts"]
    assert accounts[card]["account_alias"] == "Cash"
    assert accounts[bank].get("account_alias") is None


def test_the_four_parts_are_stored_and_shown_back_as_typed(client: TestClient):
    """Each part is presented for editing exactly as it was written, rather than split back out of
    the leaf, which could not round-trip a name whose casing the composer would flatten."""
    account = client.post(
        "/api/account",
        json={
            "kind": "card",
            "institution_name": "Bank of Example",
            "account_name": "Cash Rewards",
            "institution_alias": "BoE",
            "account_alias": "Cash",
        },
    ).json()["account"]

    assert account == "Liabilities:CC:BankOfExampleCashRewards"
    entry = client.get("/api/data").json()["meta"]["accounts"][account]
    assert entry["institution_name"] == "Bank of Example"
    assert entry["account_name"] == "Cash Rewards"
    assert entry["institution_alias"] == "BoE"
    assert entry["account_alias"] == "Cash"
    # the full name overruns the cap, and the institution's short form is enough on its own
    assert entry["name"] == "BoE Cash Rewards"


# --- one definition of which path segment a name owns ---


def test_both_rename_paths_agree_on_the_segment_a_name_owns(client: TestClient):
    """Renaming the institution and renaming the product half used to disagree: one replaced the
    last segment, the other everything below the tax tier. Round-tripping an account through both is
    what catches them drifting apart again."""
    opened = client.post(
        "/api/account",
        json={
            "kind": "investment",
            "tier": "TaxAdvantaged",
            "institution_name": "Broker X",
            "account_name": "Health Plan",
        },
    ).json()["account"]
    assert opened == "Assets:Investments:TaxAdvantaged:BrokerXHealthPlan"

    renamed = _rename(client, opened, institution_name="Broker Y").json()["account"]
    assert renamed == "Assets:Investments:TaxAdvantaged:BrokerYHealthPlan"

    again = _rename(client, renamed, account_name="Savings Plan").json()["account"]
    assert again == "Assets:Investments:TaxAdvantaged:BrokerYSavingsPlan"


def test_a_tier_move_keeps_the_composed_name(client: TestClient):
    opened = client.post(
        "/api/account",
        json={
            "kind": "investment",
            "tier": "TaxAdvantaged",
            "institution_name": "Broker X",
            "account_name": "Health Plan",
        },
    ).json()["account"]

    r = _rename(client, opened, tier="Taxable")

    assert r.status_code == 200, r.text
    assert r.json()["account"] == "Assets:Investments:Taxable:BrokerXHealthPlan"


def test_renaming_a_named_account_by_its_whole_name_is_refused(client: TestClient):
    """Its path is composed from the parts its `open` records, so setting the whole name at once
    would leave the two describing different names."""
    _, card = _held_at(client, "Bank of Example")

    r = _rename(client, card, name="Something Else")

    assert r.status_code == 422
    assert "named in parts" in r.json()["detail"]


def test_an_account_that_records_no_parts_is_still_renameable_by_name(client: TestClient):
    """A hand-written declaration is not in the naming scheme yet, so it has no parts to desync."""
    r = _rename(client, BANK_A, name="Bank Z")

    assert r.status_code == 200, r.text
    assert r.json()["account"] == "Assets:Cash:BankZ"
