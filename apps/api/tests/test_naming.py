"""Account display names: the CamelCase renderer and the alias rule."""

from __future__ import annotations

import pytest

from yala.ledger.naming import (
    NAME_CAP,
    account_name,
    institution_of,
    render,
    to_leaf,
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
    def test_short_name_ignores_aliases(self) -> None:
        """An alias is a remedy for overflow, not a preference, so a name under the cap keeps its
        full form even when one is declared."""
        meta = {"institution": BANK, "bank_alias": BANK_ALIAS}

        assert account_name("Assets:Cash:BankOfA", meta) == "Bank of A"

    def test_bank_alias_shortens_the_bank_half(self) -> None:
        meta = {"institution": BROKER, "bank_alias": BROKER_ALIAS}
        name = account_name("Assets:Investments:Taxable:BrokerageAIndividual", meta)

        assert name == "BrA Individual"

    def test_bank_alias_wins_when_both_are_declared(self) -> None:
        """The bank half goes first, and once that fits the account half keeps its full wording."""
        meta = {
            "institution": BANK,
            "bank_alias": BANK_ALIAS,
            "account_alias": "Cash",
        }
        name = account_name("Liabilities:CC:BankOfACashRewards", meta)

        assert name == "BkA Cash Rewards"

    def test_both_aliases_when_the_bank_alias_is_not_enough(self) -> None:
        """When the bank alias alone still overruns, the account alias goes in as well."""
        meta = {
            "institution": BANK,
            "bank_alias": BANK_ALIAS,
            "account_alias": "Biz Plat",
        }
        name = account_name("Liabilities:CC:BankOfABusinessPlatinum", meta)

        # Shortening the bank half alone still overruns the cap, so the account half shortens too.
        assert name == "BkA Biz Plat"
        assert len(name) <= NAME_CAP

    def test_account_alias_alone(self) -> None:
        """No bank alias on file, so the account half shortens and the bank half stays."""
        meta = {"institution": ISSUER, "account_alias": "Plus"}
        name = account_name("Liabilities:CC:CardIssuerBusinessUnlimited", meta)

        assert name == "Card Issuer Plus"

    def test_falls_back_to_the_full_name(self) -> None:
        """Over the cap with nothing declared: the cap is a target, so the long name comes through
        intact rather than being truncated here."""
        name = account_name("Liabilities:CC:SomeVeryLongCardName", {})

        assert name == "Some Very Long Card Name"
        assert len(name) > NAME_CAP

    def test_no_metadata_at_all(self) -> None:
        assert account_name("Assets:Cash:BankA") == "Bank A"

    def test_bank_alias_needs_the_institution_to_locate_the_split(self) -> None:
        """Without `institution` there is no way to know where the bank half ends, so the rule
        declines to guess and returns the full name."""
        meta = {"bank_alias": BROKER_ALIAS}
        name = account_name("Assets:Investments:Taxable:BrokerageAIndividual", meta)

        assert name == "Brokerage A Individual"

    def test_institution_that_does_not_prefix_the_name(self) -> None:
        """When the institution is not part of the account's name there is no bank half to
        substitute, so only the account alias applies."""
        meta = {"institution": ISSUER, "bank_alias": "CI", "account_alias": "Rent"}
        name = account_name("Liabilities:CC:SomeBrandedLongCardName", meta)

        assert name == "Card Issuer Rent"


class TestInstitutionOf:
    def test_declared(self) -> None:
        assert institution_of({"institution": BROKER}) == BROKER

    @pytest.mark.parametrize("meta", [None, {}, {"institution": ""}])
    def test_absent(self, meta: dict | None) -> None:
        """Never inferred from the account name."""
        assert institution_of(meta) is None


class TestToLeaf:
    @pytest.mark.parametrize(
        ("typed", "leaf"),
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
    def test_composes(self, typed: str, leaf: str) -> None:
        assert to_leaf(typed) == leaf

    @pytest.mark.parametrize(
        "typed",
        ["Bank of A", "Cash Rewards", "Roth IRA", "AB Bank", "Employer 401k"],
    )
    def test_round_trips_through_render(self, typed: str) -> None:
        """What the user typed is what they get back, so a form can promise the account will read
        the way it was written."""
        assert render(to_leaf(typed)) == typed
