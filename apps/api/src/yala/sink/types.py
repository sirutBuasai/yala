"""The leg tuples a write takes, named once so the sink and its callers agree."""

from __future__ import annotations

from decimal import Decimal

#: Money received back on a spending entry: ``(account, amount)``.
Credit = tuple[str, Decimal]
#: A payroll deduction leg: ``(account, amount)``.
DeductionLeg = tuple[str, Decimal]
#: A payroll contribution leg: ``(account, label or None, amount)``.
ContributionLeg = tuple[str, str | None, Decimal]
