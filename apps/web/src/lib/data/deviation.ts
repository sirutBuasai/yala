// Deviation primitives: one row per category, this month against the range it usually falls in.

import type { DashboardData } from '$lib/data/types';
import type { Deviation, DeviationRow } from './primitives';
import { MONEY } from './primitives';

/**
 * Per-category spend for one month against the trailing months before it: the average as `base`, the
 * lowest and highest of those months as the range it is judged against. The baseline uses up to
 * `window` prior months that have data; with none, the result is empty and the caller shows an empty
 * state.
 */
export function categoryDeviation(data: DashboardData, monthKey: string, window = 12): Deviation {
	const unit = MONEY(data.currency);
	const prior = data.meta.month_keys.filter((k) => k < monthKey && data.months[k]).slice(-window);
	if (!prior.length) return { kind: 'deviation', unit, rows: [] };

	const md = data.months[monthKey];
	if (!md) return { kind: 'deviation', unit, rows: [] };

	const spendOf = (key: string, cat: string) =>
		(data.months[key]?.by_category ?? []).find((b) => b.category === cat)?.amount ?? 0;

	// Union of categories active this month or in the baseline, so one that stopped entirely still
	// shows as a negative deviation.
	const cats = new Set<string>(md.by_category.map((b) => b.category));
	for (const k of prior) for (const b of data.months[k]?.by_category ?? []) cats.add(b.category);

	const rows: DeviationRow[] = [...cats]
		.map((cat) => {
			const history = prior.map((k) => spendOf(k, cat));
			return {
				label: cat,
				value: spendOf(monthKey, cat),
				base: history.reduce((a, b) => a + b, 0) / history.length,
				lo: Math.min(...history),
				hi: Math.max(...history)
			};
		})
		// Ranked by distance from normal in either direction, so the biggest surprises lead.
		.sort((a, b) => Math.abs(b.value - b.base) - Math.abs(a.value - a.base));

	return { kind: 'deviation', unit, rows };
}
