"""Entries by kind, which the accounts they post to decide, plus a shared delete."""

from yala.routes.entries import deleting, paychecks, transactions, transfers

ROUTERS = (transactions.router, paychecks.router, transfers.router, deleting.router)

__all__ = ["ROUTERS", "deleting", "paychecks", "transactions", "transfers"]
