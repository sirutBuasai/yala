// Deviation primitives: one row per category, this month against the range it usually falls in.

import type { DashboardData } from '$lib/data/types';
import type { Deviation, DeviationRow } from './primitives';
import { MONEY } from './primitives';
import { priorMonths } from './scope';
import { sum } from '$lib/utils/num';

/** Per-category spend for one month against up to `window` prior months with data: their average as `base`,
    their low and high as the range. Empty when no prior month has data. */
export function categoryDeviation(data: DashboardData, monthKey: string, window = 12): Deviation {
	const unit = MONEY(data.currency);
	const prior = priorMonths(data, monthKey, window);
	if (!prior.length) return { kind: 'deviation', unit, rows: [] };

	const md = data.months[monthKey];
	if (!md) return { kind: 'deviation', unit, rows: [] };

	const spendOf = (key: string, cat: string) =>
		(data.months[key]?.by_category ?? []).find((b) => b.category === cat)?.amount ?? 0;

	// Union with the baseline, so a category that stopped entirely still shows as a negative deviation.
	const cats = new Set<string>(md.by_category.map((b) => b.category));
	for (const k of prior) for (const b of data.months[k]?.by_category ?? []) cats.add(b.category);

	const rows: DeviationRow[] = [...cats]
		.map((cat) => {
			const history = prior.map((k) => spendOf(k, cat));
			return {
				label: cat,
				value: spendOf(monthKey, cat),
				base: sum(history) / history.length,
				lo: Math.min(...history),
				hi: Math.max(...history)
			};
		})
		// Distance from normal in either direction, so the biggest surprises lead.
		.sort((a, b) => Math.abs(b.value - b.base) - Math.abs(a.value - a.base));

	return { kind: 'deviation', unit, rows };
}
