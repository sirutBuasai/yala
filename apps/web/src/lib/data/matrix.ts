// Matrix primitive: a rows × cols grid of a single measure (spending per category
// per month), powering the heatmap. Oriented months (rows) × categories (cols) to
// match the dashboard's display.

import type { DashboardData } from '$lib/data/types';
import type { Matrix } from './primitives';
import { MONEY } from './primitives';
import { MONTHS } from '$lib/utils/format';

export function categoryByMonth(data: DashboardData, year: number): Matrix {
	const yd = data.years[String(year)];
	const cats = data.meta.categories;
	// values[monthIndex][categoryIndex]
	const values = MONTHS.map((_, m) => cats.map((c) => yd?.matrix[m]?.spent[c] ?? 0));

	return { kind: 'matrix', unit: MONEY(data.currency), rows: MONTHS, cols: cats, values };
}
