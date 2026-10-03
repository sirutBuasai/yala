"""Entries by kind, which the accounts they post to decide, plus the shared delete and post."""

from yala.routes.entries import actions, paychecks, transactions, transfers

ROUTERS = (transactions.router, paychecks.router, transfers.router, actions.router)

__all__ = ["ROUTERS", "actions", "paychecks", "transactions", "transfers"]
