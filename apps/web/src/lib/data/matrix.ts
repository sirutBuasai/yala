// Matrix primitive: spending per category per month, oriented months (rows) × categories (cols) so a
// year reads top-to-bottom the way its months are logged.

import type { DashboardData } from '$lib/data/types';
import type { Matrix } from './primitives';
import { MONEY } from './primitives';
import { MONTHS } from '$lib/utils/format';

export function categoryByMonth(data: DashboardData, year: number): Matrix {
	const yd = data.years[String(year)];
	// Columns are the categories with spend this year, active or closed, so a closed category's
	// historical cells stay visible while categories with no data that year drop out.
	const present = new Set<string>();
	for (const row of yd?.matrix ?? []) {
		for (const c of Object.keys(row.spent)) present.add(c);
	}
	// Biggest spender leftmost: the heatmap scales each category to its own max, so column order is
	// the only remaining cue about relative size between them.
	const total = (c: string) => (yd?.matrix ?? []).reduce((s, r) => s + (r.spent[c] ?? 0), 0);
	const cats = [...present].sort((a, b) => total(b) - total(a));
	const unit = MONEY(data.currency);

	// A year with no spend has no grid to draw. The month axis only exists to carry categories, so an
	// empty category axis would otherwise leave twelve blank rows behind.
	if (!cats.length) return { kind: 'matrix', unit, rows: [], cols: [], values: [] };

	// Only the months with a category logged. A month with none is a blank line that says nothing the
	// missing line doesn't — which is also why the axis can't be the flat twelve: a part-finished year
	// would end in a run of empty rows. NB this is narrower than a month being ACTIVE: a month whose only
	// entry is a paycheck has nothing to put in a spending grid.
	const logged = MONTHS.map((label, m) => ({
		label,
		cells: cats.map((c) => yd?.matrix[m]?.spent[c] ?? 0)
	})).filter((r) => r.cells.some((v) => v !== 0));

	return {
		kind: 'matrix',
		unit,
		rows: logged.map((r) => r.label),
		cols: cats,
		values: logged.map((r) => r.cells)
	};
}
