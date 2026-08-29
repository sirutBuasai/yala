// Matrix primitive: a rows × cols grid of a single measure (spending per category
// per month), powering the heatmap. Oriented months (rows) × categories (cols) to
// match the dashboard's display.

import type { DashboardData } from '$lib/data/types';
import type { Matrix } from './primitives';
import { MONEY } from './primitives';
import { MONTHS } from '$lib/utils/format';

export function categoryByMonth(data: DashboardData, year: number): Matrix {
	const yd = data.years[String(year)];
	// Columns are the union of categories that actually have spend this year (active or closed),
	// so a closed category's historical cells stay visible while categories with no data that year
	// drop out. Deciding the column set here keeps the chart itself a dumb renderer.
	const present = new Set<string>();
	for (const row of yd?.matrix ?? []) {
		for (const c of Object.keys(row.spent)) present.add(c);
	}
	const cats = [...present].sort();
	// values[monthIndex][categoryIndex]
	const values = MONTHS.map((_, m) => cats.map((c) => yd?.matrix[m]?.spent[c] ?? 0));

	return { kind: 'matrix', unit: MONEY(data.currency), rows: MONTHS, cols: cats, values };
}
