"""Account display names: the CamelCase renderer and the short-form rule."""

from __future__ import annotations

import pytest

from yala.ledger.naming import (
    NAME_CAP,
    account_name,
    compose,
    compose_stem,
    institution_of,
    render,
)

# The bank is multi-word on purpose: it exercises the particle rule and gives the bank half of a
# name room to shorten.
BANK = "Bank of A"
BANK_ALIAS = "BkA"
BROKER = "Brokerage A"
BROKER_ALIAS = "BrA"
ISSUER = "Card Issuer"


class TestRender:
    @pytest.mark.parametrize(
        ("leaf", "expected"),
        [
            ("BankA", "Bank A"),
            ("SavingsAccount", "Savings Account"),
            # An acronym keeps its run of caps, but the word after it separates.
            ("ABBankChecking", "AB Bank Checking"),
            ("BrokerHSA", "Broker HSA"),
            ("RothIRA", "Roth IRA"),
            # Interior particles lowercase; splitting on case alone would capitalize them.
            ("BankOfA", "Bank of A"),
            ("BankOfACashRewards", "Bank of A Cash Rewards"),
            # Letter->digit needs its own split: there is no case change at that boundary.
            ("Employer401k", "Employer 401k"),
            ("BrokerEmployer401k", "Broker Employer 401k"),
            ("AfterTax401k", "After Tax 401k"),
        ],
    )
    def test_renders(self, leaf: str, expected: str) -> None:
        assert render(leaf) == expected

    def test_leading_particle_is_left_alone(self) -> None:
        """Only *interior* particles lowercase — a name that starts with one keeps its capital."""
        assert render("OfficeSupplies") == "Office Supplies"
        assert render("TheVault") == "The Vault"

    def test_empty(self) -> None:
        assert render("") == ""


class TestAccountName:
    """The name is the parts as typed, joined; the short forms only come in while it overruns."""

    def test_short_name_ignores_the_short_forms(self) -> None:
        """A short form is a remedy for overflow, not a preference, so a name under the cap keeps
        its full form even when one is declared."""
        meta = {"institution_name": BANK, "institution_alias": BANK_ALIAS}

        assert account_name("Assets:Cash:BankOfA", meta) == "Bank of A"

    def test_the_institution_short_form_comes_in_first(self) -> None:
        meta = {
            "institution_name": BROKER,
            "account_name": "Individual",
            "institution_alias": BROKER_ALIAS,
        }
        name = account_name("Assets:Investments:Taxable:BrokerageAIndividual", meta)

        assert name == "BrA Individual"

    def test_the_product_half_keeps_its_wording_once_the_name_fits(self) -> None:
        meta = {
            "institution_name": BANK,
            "account_name": "Cash Rewards",
            "institution_alias": BANK_ALIAS,
            "account_alias": "Cash",
        }
        name = account_name("Liabilities:CC:BankOfACashRewards", meta)

        assert name == "BkA Cash Rewards"

    def test_both_short_forms_when_the_first_is_not_enough(self) -> None:
        meta = {
            "institution_name": BANK,
            "account_name": "Business Platinum",
            "institution_alias": BANK_ALIAS,
            "account_alias": "Biz Plat",
        }
        name = account_name("Liabilities:CC:BankOfABusinessPlatinum", meta)

        assert name == "BkA Biz Plat"
        assert len(name) <= NAME_CAP

    def test_the_product_short_form_alone(self) -> None:
        """No institution short form on file, so only the product half shortens."""
        meta = {
            "institution_name": ISSUER,
            "account_name": "Business Unlimited",
            "account_alias": "Plus",
        }
        name = account_name("Liabilities:CC:CardIssuerBusinessUnlimited", meta)

        assert name == "Card Issuer Plus"

    def test_falls_back_to_the_full_name(self) -> None:
        """Over the cap with no short form declared: the cap is a target, so the long name comes
        through intact rather than being truncated here."""
        meta = {"institution_name": "Some Very Long", "account_name": "Card Name"}
        name = account_name("Liabilities:CC:SomeVeryLongCardName", meta)

        assert name == "Some Very Long Card Name"
        assert len(name) > NAME_CAP

    def test_an_account_with_no_parts_reads_its_leaf(self) -> None:
        """A category, an employer, a hand-written declaration: nothing was typed in parts, so the
        path is the only name there is."""
        assert account_name("Assets:Cash:BankA") == "Bank A"
        assert account_name("Expenses:GiftCards", {}) == "Gift Cards"

    def test_a_bank_is_named_by_its_institution_alone(self) -> None:
        meta = {"institution_name": BANK, "institution_alias": BANK_ALIAS}

        assert account_name("Assets:Cash:BankOfA", meta) == "Bank of A"

    def test_the_name_no_longer_depends_on_the_leaf(self) -> None:
        """The parts are authoritative: a leaf that reads differently does not change the name,
        which is what lets a name be shown back exactly as it was typed."""
        meta = {"institution_name": ISSUER, "account_name": "Rent Card"}

        assert (
            account_name("Liabilities:CC:SomeBrandedLongCardName", meta) == "Card Issuer Rent Card"
        )


class TestInstitutionOf:
    def test_declared(self) -> None:
        assert institution_of({"institution_name": BROKER}) == BROKER

    @pytest.mark.parametrize("meta", [None, {}, {"institution_name": ""}])
    def test_absent(self, meta: dict | None) -> None:
        """Never inferred from the account name."""
        assert institution_of(meta) is None


class TestCompose:
    @pytest.mark.parametrize(
        ("typed", "segment"),
        [
            ("Bank of A", "BankOfA"),
            ("Cash Rewards", "CashRewards"),
            ("Roth IRA", "RothIRA"),
            # Caps the user typed survive, so an acronym stays one word.
            ("AB Bank", "ABBank"),
            ("Employer 401k", "Employer401k"),
            # Punctuation is a separator, not content.
            ("e.g. Brokerage", "EGBrokerage"),
            ("  spaced   out  ", "SpacedOut"),
            ("", ""),
        ],
    )
    def test_composes(self, typed: str, segment: str) -> None:
        assert compose(typed) == segment

    @pytest.mark.parametrize(
        "typed",
        ["Bank of A", "Cash Rewards", "Roth IRA", "AB Bank", "Employer 401k"],
    )
    def test_round_trips_through_render(self, typed: str) -> None:
        """What the user typed is what they get back, so a form can promise the account will read
        the way it was written."""
        assert render(compose(typed)) == typed


class TestComposeStem:
    """The one composer every account path is built from."""

    def test_joins_the_two_halves(self) -> None:
        assert compose_stem("Bank of A", "Cash Rewards") == "BankOfACashRewards"

    def test_institution_alone(self) -> None:
        assert compose_stem("Bank of A") == "BankOfA"

    @pytest.mark.parametrize("product", [None, ""])
    def test_a_missing_product_contributes_nothing(self, product: str | None) -> None:
        assert compose_stem("Bank of A", product) == "BankOfA"

    def test_composes_to_one_segment(self) -> None:
        """An account name is a single path segment, so a colon is dropped rather than nesting."""
        assert ":" not in compose_stem("Group A:Acct B", "HSA")
