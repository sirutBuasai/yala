"""Ledger entries over HTTP, one module per kind, plus the delete they share.

What separates the three is which accounts they post to, which is exactly what the read domains
classify them by — so each kind gets its own module rather than one file of near-identical forms.
"""

from yala.routes.entries import deleting, paychecks, transactions, transfers

#: This family's routers, in the order the app registers them.
ROUTERS = (transactions.router, paychecks.router, transfers.router, deleting.router)

__all__ = ["ROUTERS", "deleting", "paychecks", "transactions", "transfers"]
