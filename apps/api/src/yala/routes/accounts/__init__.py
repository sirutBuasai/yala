"""The account lifecycle. The kind (:data:`yala.ledger.accounts.KINDS`) decides which fields apply,
so an inapplicable field is reported, not dropped."""

from yala.routes.accounts import closing, naming, opening, sweeps

#: This family's routers, in the order the app registers them.
ROUTERS = (opening.router, naming.router, closing.router, sweeps.router)

__all__ = ["ROUTERS", "closing", "naming", "opening", "sweeps"]
