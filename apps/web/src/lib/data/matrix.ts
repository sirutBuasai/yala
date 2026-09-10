// Matrix primitive: spending per category per month, oriented categories (rows) × months (cols) so
// time reads left-to-right and the long category names get the roomy left gutter.

import type { DashboardData } from '$lib/data/types';
import type { Matrix } from './primitives';
import { MONEY } from './primitives';
import { MONTHS } from '$lib/utils/format';

export function categoryByMonth(data: DashboardData, year: number): Matrix {
	const yd = data.years[String(year)];
	// Rows are the categories with spend this year, active or closed, so a closed category's
	// historical cells stay visible while categories with no data that year drop out.
	const present = new Set<string>();
	for (const row of yd?.matrix ?? []) {
		for (const c of Object.keys(row.spent)) present.add(c);
	}
	// Biggest spender first: the heatmap normalizes per row, so row order is the only remaining cue
	// about relative size between rows.
	const total = (c: string) => (yd?.matrix ?? []).reduce((s, r) => s + (r.spent[c] ?? 0), 0);
	const cats = [...present].sort((a, b) => total(b) - total(a));
	const values = cats.map((c) => MONTHS.map((_, m) => yd?.matrix[m]?.spent[c] ?? 0));

	return { kind: 'matrix', unit: MONEY(data.currency), rows: cats, cols: MONTHS, values };
}
