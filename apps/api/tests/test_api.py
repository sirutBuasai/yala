"""API tests via FastAPI TestClient over a tmp copy of the fixture ledger."""

from __future__ import annotations

import shutil
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from yala import config
from yala.api import app

FIXTURE_LEDGER = Path(__file__).parent / "fixtures" / "ledger"


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    ledger_dir = tmp_path / "ledger"
    shutil.copytree(FIXTURE_LEDGER, ledger_dir)
    monkeypatch.setattr(config, "LEDGER_DIR", ledger_dir)
    monkeypatch.setattr(config, "MAIN_LEDGER", ledger_dir / "main.beancount")
    return TestClient(app)


def test_get_data_returns_contract(client: TestClient):
    r = client.get("/api/data")
    assert r.status_code == 200
    assert r.json()["schema_version"] == 1


def test_get_accounts_keys(client: TestClient):
    r = client.get("/api/accounts")
    assert r.status_code == 200
    body = r.json()
    assert set(body) == {
        "spending_categories",
        "funding_accounts",
        "employers",
        "payroll_options",
        "cash_accounts",
        "credit_accounts",
        "sweeps",
    }
    # closed account is excluded from active funding accounts
    assert "Liabilities:CC:CardD" not in body["funding_accounts"]
    # only open employers surface; Employer2 was closed
    assert body["employers"] == ["Employer1"]


def test_accounts_payroll_options_scoped_and_split(client: TestClient):
    body = client.get("/api/accounts").json()
    opts = body["payroll_options"]

    contribs = {o["label"] for o in opts if o["kind"] == "contribution"}
    assert {"Roth401k", "Trad401k", "AfterTax401k", "HSA"} <= contribs
    assert "LegacyPlan" not in contribs  # closed payroll account excluded

    # the 401k splits all resolve to ONE shared account (net worth sees one pot)
    k401 = "Assets:Investments:TaxAdvantaged:Employer401k"
    splits = [o for o in opts if o["label"] in {"Roth401k", "Trad401k", "AfterTax401k"}]
    assert {o["account"] for o in splits} == {k401}
    assert all(o["employer"] == "Employer1" for o in splits)

    # generic deductions carry no employer scope
    tax = next(o for o in opts if o["label"] == "Tax")
    assert tax["kind"] == "deduction" and tax["employer"] is None

    # income can still load the historical postings
    assert client.get("/api/data").json()["income"]["by_year"]


def test_accounts_credit_accounts(client: TestClient):
    body = client.get("/api/accounts").json()
    credit = body["credit_accounts"]
    assert "Assets:Cash:Wallet" in credit
    # a payback can be a credit-card refund/credit
    assert any(a.startswith("Liabilities:CC:") for a in credit)
    assert "Liabilities:CC:CardA" in credit
    # the abandoned friends/receivable model is no longer a payback source
    assert not any(a.startswith("Assets:Receivable:") for a in credit)


def test_post_transaction_is_visible_on_next_get(client: TestClient):
    r = client.post(
        "/api/transaction",
        json={
            "date": "2026-02-01",
            "payee": "api coffee",
            "amount": 4.25,
            "category": "Takeouts",
            "funding_account": "Liabilities:CC:CardA",
            "pending": False,
        },
    )
    assert r.status_code == 200
    assert r.json()["ok"] is True

    data = client.get("/api/data").json()
    txns = data["months"]["2026-02"]["transactions"]
    coffee = [t for t in txns if t["payee"] == "api coffee"][0]
    # source is the funding account (no src label), and a locator is emitted
    assert coffee["source"] == "Liabilities:CC:CardA"
    assert coffee["locator"]


def test_post_netted_transaction_counts_net_share(client: TestClient):
    r = client.post(
        "/api/transaction",
        json={
            "date": "2026-02-01",
            "payee": "group dinner",
            "amount": 300.0,  # the total bill
            "category": "Takeouts",
            "funding_account": "Liabilities:CC:CardA",
            "credits": [{"account": "Assets:Cash:Wallet", "amount": 200.0}],
        },
    )
    assert r.status_code == 200
    data = client.get("/api/data").json()
    dinner = [t for t in data["months"]["2026-02"]["transactions"] if t["payee"] == "group dinner"][
        0
    ]
    assert dinner["amount"] == 100.0  # net share only (300 - 200)
    assert dinner["bill"] == 300.0  # bill meta records the total


def test_update_transaction_flow(client: TestClient):
    r = client.post(
        "/api/transaction",
        json={
            "date": "2026-02-01",
            "payee": "reconcile me",
            "amount": 40.0,
            "category": "Takeouts",
            "funding_account": "Liabilities:CC:CardA",
            "pending": True,
        },
    )
    entry_id = r.json()["id"]

    pending = client.get("/api/pending").json()["pending"]
    assert any(p["locator"] == f"id:{entry_id}" for p in pending)

    detail = client.get("/api/transaction", params={"locator": f"id:{entry_id}"}).json()
    assert detail["pending"] is True
    assert detail["amount"] == 40.0

    u = client.post(
        "/api/transaction/update",
        json={
            "locator": f"id:{entry_id}",
            "payee": "reconcile me",
            "amount": 40.0,  # total bill; a friend paid $25 back
            "category": "Takeouts",
            "funding_account": "Liabilities:CC:CardA",
            "pending": False,
            "credits": [{"account": "Assets:Cash:Wallet", "amount": 25.0}],
        },
    )
    assert u.status_code == 200
    assert u.json()["id"] == entry_id

    detail2 = client.get("/api/transaction", params={"locator": f"id:{entry_id}"}).json()
    assert detail2["pending"] is False
    assert detail2["amount"] == 40.0  # total bill (net + Σ paybacks)
    assert detail2["net_expense"] == 15.0  # your share
    assert detail2["bill"] == 40.0
    assert detail2["credits"] == [{"account": "Assets:Cash:Wallet", "amount": 25.0}]


def test_txn_detail_when_funding_and_credit_share_account(client: TestClient):
    # Regression: funding account == credit account (all Assets:Cash:BankA).
    # The prefill must still identify the outflow (-total) as funding, not a credit.
    r = client.post(
        "/api/transaction",
        json={
            "date": "2026-02-01",
            "payee": "same-account dinner",
            "amount": 1000.0,  # total bill
            "category": "Grocery",
            "funding_account": "Assets:Cash:BankA",
            "credits": [
                {"account": "Assets:Cash:BankA", "amount": 500.0},
                {"account": "Assets:Cash:BankA", "amount": 250.0},
            ],
        },
    )
    entry_id = r.json()["id"]
    d = client.get("/api/transaction", params={"locator": f"id:{entry_id}"}).json()
    assert d["amount"] == 1000.0  # total bill, not -500
    assert d["net_expense"] == 250.0  # your share (1000 - 500 - 250)
    assert d["funding_account"] == "Assets:Cash:BankA"
    assert sorted(s["amount"] for s in d["credits"]) == [250.0, 500.0]


def test_post_account_invalid_leaf_is_422(client: TestClient):
    r = client.post("/api/account", json={"kind": "category", "leaf": "Bad Leaf"})
    assert r.status_code == 422


def test_post_account_declares_spending_category(client: TestClient):
    r = client.post("/api/account", json={"kind": "category", "leaf": "Gifts"})
    assert r.status_code == 200
    assert r.json()["account"] == "Expenses:Gifts"
    cats = client.get("/api/accounts").json()["spending_categories"]
    assert "Gifts" in cats


def test_post_account_declares_funding_credit_and_cash(client: TestClient):
    rc = client.post("/api/account", json={"kind": "funding_credit", "leaf": "CardZ"})
    assert rc.json()["account"] == "Liabilities:CC:CardZ"
    rk = client.post("/api/account", json={"kind": "funding_cash", "leaf": "BankZ"})
    assert rk.json()["account"] == "Assets:Cash:BankZ"

    funding = client.get("/api/accounts").json()["funding_accounts"]
    assert "Liabilities:CC:CardZ" in funding
    assert "Assets:Cash:BankZ" in funding


def test_close_category_removes_it_from_pickers(client: TestClient):
    client.post("/api/account", json={"kind": "category", "leaf": "Gifts"})
    assert "Gifts" in client.get("/api/accounts").json()["spending_categories"]

    r = client.post("/api/account/close", json={"account": "Expenses:Gifts"})
    assert r.status_code == 200
    assert r.json()["account"] == "Expenses:Gifts"
    assert "Gifts" not in client.get("/api/accounts").json()["spending_categories"]


def test_close_bank_account_removes_it_from_pickers(client: TestClient):
    assert "Assets:Cash:BankA" in client.get("/api/accounts").json()["cash_accounts"]

    r = client.post("/api/account/close", json={"account": "Assets:Cash:BankA"})
    assert r.status_code == 200
    assert r.json()["account"] == "Assets:Cash:BankA"
    assert "Assets:Cash:BankA" not in client.get("/api/accounts").json()["cash_accounts"]


def test_close_passthrough_account_succeeds(client: TestClient):
    # Venmo is a passthrough (sweep_to Wealthfront) but is still closeable like any bank account.
    r = client.post("/api/account/close", json={"account": "Assets:Cash:Venmo"})
    assert r.status_code == 200
    assert "Assets:Cash:Venmo" not in client.get("/api/accounts").json()["cash_accounts"]


def test_close_non_closeable_account_is_422(client: TestClient):
    r = client.post("/api/account/close", json={"account": "Assets:Investments:Brokerage"})
    assert r.status_code == 422


def test_close_deductions_account_is_422(client: TestClient):
    r = client.post("/api/account/close", json={"account": "Expenses:Deductions:Tax"})
    assert r.status_code == 422


def test_close_unopened_category_is_422(client: TestClient):
    r = client.post("/api/account/close", json={"account": "Expenses:DoesNotExist"})
    assert r.status_code == 422


def test_new_category_is_usable_by_a_transaction(client: TestClient):
    client.post("/api/account", json={"kind": "category", "leaf": "Gifts"})
    r = client.post(
        "/api/transaction",
        json={
            # no date -> today; the category was opened today, so an earlier date would
            # (correctly) be rejected by the active-on-date check.
            "payee": "birthday",
            "amount": 20.0,
            "category": "Gifts",
            "funding_account": "Liabilities:CC:CardA",
        },
    )
    assert r.status_code == 200


def test_post_transaction_before_open_date_is_422_with_clear_detail(client: TestClient):
    r = client.post(
        "/api/transaction",
        json={
            "date": "2026-01-05",
            "payee": "too early",
            "amount": 10.0,
            "category": "Takeouts",
            "funding_account": "Liabilities:CC:CardC",  # opened 2026-08-14
        },
    )
    assert r.status_code == 422
    detail = r.json()["detail"]
    assert detail.startswith("Unable to insert transaction:")
    assert "Liabilities:CC:CardC" in detail
    assert "not open as of date" in detail
    assert "2026-08-14" in detail


def test_post_transaction_invalid_category_is_422(client: TestClient):
    r = client.post(
        "/api/transaction",
        json={
            "payee": "bad",
            "amount": 1.0,
            "category": "Takeouts USD\n  Bogus",
            "funding_account": "Liabilities:CC:CardA",
        },
    )
    assert r.status_code == 422


def test_post_transaction_invalid_date_is_422(client: TestClient):
    r = client.post(
        "/api/transaction",
        json={
            "date": "2026-13-40",  # not a real date
            "payee": "bad date",
            "amount": 1.0,
            "category": "Takeouts",
            "funding_account": "Liabilities:CC:CardA",
        },
    )
    assert r.status_code == 422
    assert "invalid date" in r.json()["detail"]


def test_get_transaction_unknown_locator_is_404(client: TestClient):
    r = client.get("/api/transaction", params={"locator": "id:does-not-exist"})
    assert r.status_code == 404
    assert "no transaction found" in r.json()["detail"]


def test_update_unknown_locator_is_404(client: TestClient):
    r = client.post(
        "/api/transaction/update",
        json={
            "locator": "id:does-not-exist",
            "payee": "ghost",
            "amount": 1.0,
            "category": "Takeouts",
            "funding_account": "Liabilities:CC:CardA",
        },
    )
    assert r.status_code == 404
    assert "no transaction found" in r.json()["detail"]


# --- paycheck endpoint ---


def test_post_paycheck_is_visible_on_next_get(client: TestClient):
    r = client.post(
        "/api/paycheck",
        json={
            "date": "2026-02-15",
            "employer": "Employer1",
            "gross": 3000.0,
            "deductions": {"Tax": 600.0, "Insurance": 100.0},
            "contributions": {"HSA": 150.0, "Roth401k": 600.0},
            "deposit_account": "Assets:Cash:BankB",
        },
    )
    assert r.status_code == 200
    assert r.json()["ok"] is True

    paychecks = client.get("/api/data").json()["months"]["2026-02"]["paychecks"]
    match = next(p for p in paychecks if p["gross"] == 3000.0)
    assert match["employer"] == "Employer1"
    assert match["contributions"] == {"HSA": 150.0, "Roth401k": 600.0}


def test_get_and_update_paycheck_flow(client: TestClient):
    r = client.post(
        "/api/paycheck",
        json={
            "date": "2026-02-15",
            "employer": "Employer1",
            "gross": 3000.0,
            "deductions": {"Tax": 600.0},
            "contributions": {"HSA": 150.0},
            "deposit_account": "Assets:Cash:BankB",
        },
    )
    assert r.status_code == 200
    loc = client.get("/api/data").json()["months"]["2026-02"]["paychecks"][0]["locator"]

    state = client.get("/api/paycheck", params={"locator": loc}).json()
    assert state["gross"] == 3000.0
    assert state["employer"] == "Employer1"
    assert state["deductions"] == {"Tax": 600.0}
    assert state["contributions"] == {"HSA": 150.0}
    assert state["deposit_account"] == "Assets:Cash:BankB"

    u = client.post(
        "/api/paycheck/update",
        json={
            "locator": loc,
            "date": "2026-02-15",
            "employer": "Employer1",
            "gross": 3200.0,
            "deductions": {"Tax": 640.0},
            "contributions": {"Roth401k": 150.0},
            "deposit_account": "Assets:Cash:BankB",
        },
    )
    assert u.status_code == 200

    state2 = client.get("/api/paycheck", params={"locator": loc}).json()
    assert state2["gross"] == 3200.0
    assert state2["deductions"]["Tax"] == 640.0
    assert state2["contributions"] == {"Roth401k": 150.0}  # split relabels on read


def test_post_paycheck_inactive_employer_is_422(client: TestClient):
    """A closed employer (Employer2) is no longer selectable for new paychecks."""
    r = client.post(
        "/api/paycheck",
        json={
            "employer": "Employer2",
            "gross": 1000.0,
            "deductions": {"Tax": 100.0},
            "contributions": {},
            "deposit_account": "Assets:Cash:BankB",
        },
    )
    assert r.status_code == 422
    assert "employer" in r.json()["detail"].lower()


def test_post_paycheck_contribution_not_offered_by_employer_is_422(client: TestClient):
    """A contribution label the employer doesn't offer is rejected."""
    r = client.post(
        "/api/paycheck",
        json={
            "employer": "Employer1",
            "gross": 1000.0,
            "deductions": {},
            "contributions": {"Pension": 100.0},  # no such option
            "deposit_account": "Assets:Cash:BankB",
        },
    )
    assert r.status_code == 422
    assert "Pension" in r.json()["detail"]


def test_get_paycheck_unknown_is_404(client: TestClient):
    r = client.get("/api/paycheck", params={"locator": "id:nope"})
    assert r.status_code == 404


def test_update_paycheck_unknown_is_404(client: TestClient):
    r = client.post(
        "/api/paycheck/update",
        json={
            "locator": "id:nope",
            "employer": "Employer1",
            "gross": 100.0,
            "deductions": {},
            "contributions": {},
            "deposit_account": "Assets:Cash:BankB",
        },
    )
    assert r.status_code == 404


def test_get_paycheck_on_spending_txn_is_422(client: TestClient):
    r = client.post(
        "/api/transaction",
        json={
            "payee": "not a paycheck",
            "amount": 5.0,
            "category": "Takeouts",
            "funding_account": "Liabilities:CC:CardA",
        },
    )
    loc = r.json()["id"]
    resp = client.get("/api/paycheck", params={"locator": f"id:{loc}"})
    assert resp.status_code == 422


def test_post_paycheck_take_home_negative_is_422(client: TestClient):
    r = client.post(
        "/api/paycheck",
        json={
            "employer": "Employer1",
            "gross": 1000.0,
            "deductions": {"Tax": 900.0},
            "contributions": {"Roth401k": 500.0},  # exceeds gross
            "deposit_account": "Assets:Cash:BankB",
        },
    )
    assert r.status_code == 422
    assert "exceed gross" in r.json()["detail"]


def test_post_paycheck_unopened_account_is_422_with_clear_detail(client: TestClient):
    r = client.post(
        "/api/paycheck",
        json={
            "date": "2026-02-15",
            "employer": "Employer1",
            "gross": 1000.0,
            "deductions": {"Tax": 100.0},
            "contributions": {},
            "deposit_account": "Assets:Cash:NonExistent",  # never opened
        },
    )
    assert r.status_code == 422
    detail = r.json()["detail"]
    assert "Assets:Cash:NonExistent" in detail
    assert "does not exist" in detail


# --- delete endpoint ---


def test_delete_transaction_flow(client: TestClient):
    r = client.post(
        "/api/transaction",
        json={
            "date": "2026-02-01",
            "payee": "delete via api",
            "amount": 9.0,
            "category": "Takeouts",
            "funding_account": "Liabilities:CC:CardA",
        },
    )
    entry_id = r.json()["id"]

    d = client.post("/api/transaction/delete", json={"locator": f"id:{entry_id}"})
    assert d.status_code == 200
    assert d.json()["ok"] is True

    txns = client.get("/api/data").json()["months"].get("2026-02", {}).get("transactions", [])
    assert not [t for t in txns if t["payee"] == "delete via api"]


def test_delete_unknown_locator_is_404(client: TestClient):
    r = client.post("/api/transaction/delete", json={"locator": "id:does-not-exist"})
    assert r.status_code == 404
    assert "no transaction found" in r.json()["detail"]


def test_update_across_year_moves_txn_between_month_pages(client: TestClient):
    r = client.post(
        "/api/transaction",
        json={
            "date": "2026-02-01",
            "payee": "relocating",
            "amount": 12.0,
            "category": "Takeouts",
            "funding_account": "Liabilities:CC:CardA",
        },
    )
    entry_id = r.json()["id"]
    assert any(
        t["payee"] == "relocating"
        for t in client.get("/api/data").json()["months"]["2026-02"]["transactions"]
    )

    u = client.post(
        "/api/transaction/update",
        json={
            "locator": f"id:{entry_id}",
            "date": "2027-05-10",  # crosses into 2027
            "payee": "relocating",
            "amount": 12.0,
            "category": "Takeouts",
            "funding_account": "Liabilities:CC:CardA",
        },
    )
    assert u.status_code == 200

    data = client.get("/api/data").json()
    # the only 2026-02 activity moved away, so that month page is gone entirely
    old = data["months"].get("2026-02", {}).get("transactions", [])
    assert not [t for t in old if t["payee"] == "relocating"]
    assert any(t["payee"] == "relocating" for t in data["months"]["2027-05"]["transactions"])


def test_transfer_add_get_and_surfaces_in_month(client: TestClient):
    add = client.post(
        "/api/transfer",
        json={
            "date": "2026-03-05",
            "payee": "card autopay",
            "from_account": "Assets:Cash:BankA",
            "to_account": "Liabilities:CC:CardA",
            "amount": 250.0,
        },
    )
    assert add.status_code == 200
    locator = f"id:{add.json()['id']}"

    got = client.get("/api/transfer", params={"locator": locator}).json()
    assert got["from_account"] == "Assets:Cash:BankA"
    assert got["to_account"] == "Liabilities:CC:CardA"
    assert got["amount"] == 250.0

    transfers = client.get("/api/data").json()["months"]["2026-03"]["transfers"]
    assert [t["payee"] for t in transfers] == ["card autopay"]


def test_transfer_update_and_delete(client: TestClient):
    add = client.post(
        "/api/transfer",
        json={
            "date": "2026-03-05",
            "from_account": "Assets:Cash:BankA",
            "to_account": "Liabilities:CC:CardA",
            "amount": 250.0,
        },
    )
    locator = f"id:{add.json()['id']}"

    upd = client.post(
        "/api/transfer/update",
        json={
            "locator": locator,
            "from_account": "Assets:Cash:BankB",
            "to_account": "Liabilities:CC:CardA",
            "amount": 300.0,
        },
    )
    assert upd.status_code == 200
    assert client.get("/api/transfer", params={"locator": locator}).json()["amount"] == 300.0

    d = client.post("/api/transaction/delete", json={"locator": locator})
    assert d.status_code == 200
    assert client.get("/api/data").json()["months"].get("2026-03", {}).get("transfers", []) == []


# --- request-body validation (pydantic → 422) ---


def _txn_body(**overrides) -> dict:
    body = {
        "payee": "x",
        "amount": 1.0,
        "category": "Takeouts",
        "funding_account": "Liabilities:CC:CardA",
    }
    body.update(overrides)
    return body


@pytest.mark.parametrize("bad_amount", [0, -5.0])
def test_post_transaction_non_positive_amount_is_422(client: TestClient, bad_amount: float):
    r = client.post("/api/transaction", json=_txn_body(amount=bad_amount))
    assert r.status_code == 422


@pytest.mark.parametrize("bad_amount", [float("nan"), float("inf"), float("-inf")])
def test_transaction_body_rejects_non_finite_amount(bad_amount: float):
    # JSON has no non-finite literals, so a compliant client can't send these; the constraint is
    # defense in depth. Assert it at the model layer (HTTP's error-echo can't encode nan/inf).
    from pydantic import ValidationError

    from yala.api import TransactionIn

    with pytest.raises(ValidationError):
        TransactionIn(**_txn_body(amount=bad_amount))


def test_post_transaction_negative_credit_is_422(client: TestClient):
    r = client.post(
        "/api/transaction",
        json=_txn_body(credits=[{"account": "Assets:Cash:Wallet", "amount": -1.0}]),
    )
    assert r.status_code == 422


def test_post_transaction_zero_credit_is_422(client: TestClient):
    r = client.post(
        "/api/transaction",
        json=_txn_body(credits=[{"account": "Assets:Cash:Wallet", "amount": 0}]),
    )
    assert r.status_code == 422


def test_post_transfer_to_expense_account_is_422(client: TestClient):
    r = client.post(
        "/api/transfer",
        json={
            "from_account": "Assets:Cash:BankA",
            "to_account": "Expenses:Takeouts",  # not a balance-sheet account
            "amount": 10.0,
        },
    )
    assert r.status_code == 422
    assert "asset or liability" in r.json()["detail"]


def test_post_transfer_same_account_is_422(client: TestClient):
    r = client.post(
        "/api/transfer",
        json={
            "from_account": "Assets:Cash:BankA",
            "to_account": "Assets:Cash:BankA",
            "amount": 10.0,
        },
    )
    assert r.status_code == 422


def test_post_transfer_non_positive_amount_is_422(client: TestClient):
    r = client.post(
        "/api/transfer",
        json={
            "from_account": "Assets:Cash:BankA",
            "to_account": "Liabilities:CC:CardA",
            "amount": 0,
        },
    )
    assert r.status_code == 422


def test_post_paycheck_negative_deduction_is_422(client: TestClient):
    r = client.post(
        "/api/paycheck",
        json={
            "employer": "Employer1",
            "gross": 1000.0,
            "deductions": {"Tax": -1.0},
            "deposit_account": "Assets:Cash:BankA",
        },
    )
    assert r.status_code == 422


def test_post_transaction_payee_newline_is_sanitized(client: TestClient):
    """A payee is a single line: newlines/control chars are stripped before it reaches the ledger.

    beancount escapes quotes but preserves raw newlines, which would corrupt the line-based file.
    """
    r = client.post(
        "/api/transaction",
        json=_txn_body(
            date="2026-02-01", payee="hello\n2020-01-01 open Assets:Hacked USD\n; injected"
        ),
    )
    assert r.status_code == 200
    txns = client.get("/api/data").json()["months"]["2026-02"]["transactions"]
    match = next(t for t in txns if t["locator"] == f"id:{r.json()['id']}")
    assert match["payee"] == "hello 2020-01-01 open Assets:Hacked USD ; injected"
    assert "\n" not in match["payee"]


def test_post_transaction_blank_payee_is_422_with_clear_detail(client: TestClient):
    r = client.post("/api/transaction", json=_txn_body(payee="   "))
    assert r.status_code == 422
    assert r.json()["detail"] == "Title must not be blank"


def test_post_transaction_payee_too_long_is_422(client: TestClient):
    r = client.post("/api/transaction", json=_txn_body(payee="x" * 201))
    assert r.status_code == 422
    assert "at most 200 characters" in r.json()["detail"]


def test_validation_detail_is_a_readable_string(client: TestClient):
    """A pydantic body-validation failure is flattened to one labeled sentence, not a raw list."""
    r = client.post("/api/transaction", json=_txn_body(amount=0))
    assert r.status_code == 422
    assert r.json()["detail"] == "Amount must be greater than 0"


def test_post_transaction_amount_above_ceiling_is_422(client: TestClient):
    r = client.post("/api/transaction", json=_txn_body(amount=1e13))
    assert r.status_code == 422
    assert "Amount must be at most" in r.json()["detail"]


def test_update_transaction_invalid_date_is_422(client: TestClient):
    add = client.post("/api/transaction", json=_txn_body(date="2026-02-01"))
    locator = f"id:{add.json()['id']}"

    r = client.post(
        "/api/transaction/update",
        json=_txn_body(date="2026-13-40", locator=locator),
    )
    assert r.status_code == 422
    assert "invalid date" in r.json()["detail"]
