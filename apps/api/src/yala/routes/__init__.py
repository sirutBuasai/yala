"""HTTP routers, one module per family of endpoints.

Shared validation lives in :mod:`yala.routes.common`; :mod:`yala.api` registers every router in
:data:`ROUTERS`.
"""

from yala.routes import accounts, balances, entries, settings

ROUTERS = (*entries.ROUTERS, *accounts.ROUTERS, balances.router, settings.router)

__all__ = ["ROUTERS", "accounts", "balances", "entries", "settings"]
