// Categorical primitives: named parts of a whole, over plain `{category, amount}` inputs.

import type { Categorical, CategoricalPoint, Unit } from './primitives';
import { MONEY } from './primitives';
import { sumBy } from '$lib/utils/num';

export interface Amount {
	category: string;
	amount: number;
	/** Passed through as the point's `colorKey` — see `CategoricalPoint`. */
	colorKey?: string;
}

/** Sort descending, drop non-positive, and roll the tail beyond `limit` into "Other". */
export function rollup(points: CategoricalPoint[], limit = 10): CategoricalPoint[] {
	const sorted = points.filter((p) => p.value > 0).sort((a, b) => b.value - a.value);

	if (sorted.length <= limit) return sorted;

	const head = sorted.slice(0, limit - 1);
	const rest = sumBy(sorted.slice(limit - 1), (p) => p.value);

	return [...head, { key: 'Other', value: rest }];
}

/** Category amounts as a categorical primitive (largest first, capped with "Other"). */
export function categorical(items: Amount[], unit: Unit = MONEY(), limit = 10): Categorical {
	const points = rollup(
		items.map((i) => ({ key: i.category, value: i.amount, colorKey: i.colorKey })),
		limit
	);

	return { kind: 'categorical', unit, points };
}

/** Spending categories (rolled up) plus a `Saved` slice when income exceeded spending. */
export function whereItWent(
	items: Amount[],
	income: number,
	spent: number,
	unit: Unit = MONEY(),
	limit = 10
): Categorical {
	const saved = income - spent;
	const savedShown = income > 0 && saved > 0;
	// The Saved slice counts toward the cap, so leave room for it when shown.
	const points = rollup(
		items.map((i) => ({ key: i.category, value: i.amount })),
		savedShown ? limit - 1 : limit
	);

	if (savedShown) points.push({ key: 'Saved', value: saved });

	return { kind: 'categorical', unit, points };
}
