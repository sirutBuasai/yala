// Categorical primitives: named parts of a whole (spending by category, the
// "where it went" donut). Pure over plain `{category, amount}` inputs so both the
// catalog and views can reuse them; colour is assigned later by the chart registry.

import type { DashboardData } from '$lib/data/types';
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

/**
 * Per-category deviation of one month from the trailing average of the months before it —
 * signed, so positive means "spent more than usual". This is the actionable counterpart to the
 * composition donut: a second ranking of the same amounts would only restate the donut, whereas
 * the delta says which categories actually broke from the norm.
 *
 * The baseline uses up to `window` prior months that have data. With fewer than two such months
 * there's no norm to compare against, so the result is empty and the caller shows an empty state.
 */
export function categoryDeviation(data: DashboardData, monthKey: string, window = 12): Categorical {
	const unit = MONEY(data.currency);
	const prior = data.meta.month_keys.filter((k) => k < monthKey && data.months[k]).slice(-window);
	if (!prior.length) return { kind: 'categorical', unit, points: [] };

	const md = data.months[monthKey];
	if (!md) return { kind: 'categorical', unit, points: [] };

	const spendOf = (key: string, cat: string) =>
		(data.months[key]?.by_category ?? []).find((b) => b.category === cat)?.amount ?? 0;

	// Union of categories active this month or in the baseline, so a category that stopped
	// entirely still shows as a negative deviation.
	const cats = new Set<string>(md.by_category.map((b) => b.category));
	for (const k of prior) for (const b of data.months[k]?.by_category ?? []) cats.add(b.category);

	const points: CategoricalPoint[] = [...cats]
		.map((c) => {
			const avg = prior.reduce((s, k) => s + spendOf(k, c), 0) / prior.length;
			return { key: c, value: spendOf(monthKey, c) - avg };
		})
		// Rank by how far from normal, in either direction — the biggest surprises first.
		.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

	return { kind: 'categorical', unit, points };
}
