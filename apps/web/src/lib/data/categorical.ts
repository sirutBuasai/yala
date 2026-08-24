// Categorical primitives: named parts of a whole (spending by category, the
// "where it went" donut). Pure over plain `{category, amount}` inputs so both the
// catalog and views can reuse them; colour is assigned later by the chart registry.

import type { Categorical, CategoricalPoint, Unit } from './primitives';
import { MONEY } from './primitives';

export interface Amount {
	category: string;
	amount: number;
}

/** Sort descending, drop non-positive, and roll the tail beyond `limit` into "Other". */
export function rollup(points: CategoricalPoint[], limit = 10): CategoricalPoint[] {
	const sorted = points.filter((p) => p.value > 0).sort((a, b) => b.value - a.value);

	if (sorted.length <= limit) return sorted;

	const head = sorted.slice(0, limit - 1);
	const rest = sorted.slice(limit - 1).reduce((a, p) => a + p.value, 0);

	return [...head, { key: 'Other', value: rest }];
}

/** Category amounts as a categorical primitive (largest first, capped with "Other"). */
export function categorical(items: Amount[], unit: Unit = MONEY(), limit = 10): Categorical {
	const points = rollup(
		items.map((i) => ({ key: i.category, value: i.amount })),
		limit
	);

	return { kind: 'categorical', unit, points };
}

/**
 * "Where it all went": spending categories (rolled up) plus a distinct `Saved`
 * slice when income exceeded spending. Shared by the Overview and Monthly donuts,
 * which previously each rebuilt this inline.
 */
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
