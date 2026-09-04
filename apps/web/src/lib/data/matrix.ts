// Matrix primitive: a rows × cols grid of a single measure (spending per category
// per month), powering the heatmap. Oriented categories (rows) × months (cols): time
// reads left-to-right, and the long axis labels (category names) get the roomy left
// gutter instead of being squeezed into twelve column headers.

import type { DashboardData } from '$lib/data/types';
import type { Matrix } from './primitives';
import { MONEY } from './primitives';
import { MONTHS } from '$lib/utils/format';

export function categoryByMonth(data: DashboardData, year: number): Matrix {
	const yd = data.years[String(year)];
	// Rows are the union of categories that actually have spend this year (active or closed),
	// so a closed category's historical cells stay visible while categories with no data that year
	// drop out. Deciding the row set here keeps the chart itself a dumb renderer.
	const present = new Set<string>();
	for (const row of yd?.matrix ?? []) {
		for (const c of Object.keys(row.spent)) present.add(c);
	}
	// Biggest spender first: the heatmap normalizes per row, so ordering by magnitude is the
	// only remaining cue about relative size between rows.
	const total = (c: string) => (yd?.matrix ?? []).reduce((s, r) => s + (r.spent[c] ?? 0), 0);
	const cats = [...present].sort((a, b) => total(b) - total(a));
	// values[categoryIndex][monthIndex]
	const values = cats.map((c) => MONTHS.map((_, m) => yd?.matrix[m]?.spent[c] ?? 0));

	return { kind: 'matrix', unit: MONEY(data.currency), rows: cats, cols: MONTHS, values };
}
