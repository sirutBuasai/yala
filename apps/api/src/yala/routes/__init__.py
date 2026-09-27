"""HTTP routers; :mod:`yala.api` registers every one in :data:`ROUTERS`."""

from yala.routes import accounts, balances, entries, settings

ROUTERS = (*entries.ROUTERS, *accounts.ROUTERS, balances.router, settings.router)

__all__ = ["ROUTERS", "accounts", "balances", "entries", "settings"]
