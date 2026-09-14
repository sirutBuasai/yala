"""The account lifecycle over HTTP, one module per stage: opening, naming, closing, sweeping.

Which fields a request may carry is decided by the account's kind
(:data:`yala.ledger.accounts.KINDS`) rather than by the caller, so a field that cannot apply is
reported instead of silently dropped.
"""

from yala.routes.accounts import closing, naming, opening, sweeps

#: This family's routers, in the order the app registers them.
ROUTERS = (opening.router, naming.router, closing.router, sweeps.router)

__all__ = ["ROUTERS", "closing", "naming", "opening", "sweeps"]
