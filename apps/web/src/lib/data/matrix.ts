// Matrix primitive: spending per category per month, oriented months (rows) × categories (cols).

import type { DashboardData } from '$lib/data/types';
import type { Matrix } from './primitives';
import { MONEY } from './primitives';
import { MONTHS } from '$lib/utils/format';

export function categoryByMonth(data: DashboardData, year: number): Matrix {
	const yd = data.years[String(year)];
	// Categories with spend this year, active or closed, so a closed one keeps its historical cells.
	const present = new Set<string>();
	for (const row of yd?.matrix ?? []) {
		for (const c of Object.keys(row.spent)) present.add(c);
	}
	// Biggest spender leftmost: the heatmap scales each column to its own max, so order is the only
	// remaining cue about relative size.
	const total = (c: string) => (yd?.matrix ?? []).reduce((s, r) => s + (r.spent[c] ?? 0), 0);
	const cats = [...present].sort((a, b) => total(b) - total(a));
	const unit = MONEY(data.currency);

	// No categories means no grid; the month axis alone would just be blank rows.
	if (!cats.length) return { kind: 'matrix', unit, rows: [], cols: [], values: [] };

	// Only months with a category logged — narrower than a month being active, since a month whose only
	// entry is a paycheck has nothing to put in a spending grid. A flat twelve would tail off in blanks.
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
