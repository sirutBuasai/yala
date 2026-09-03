// The calendar's arithmetic, with no Svelte and no DOM in sight — which is the point: laying a month
// out onto week rows and deciding which day a keypress lands on are the two things here most likely
// to be wrong at a month boundary, and both are far easier to trust as pure functions with tests
// than as expressions buried in a component.

import type { DashboardData } from '$lib/data/types';

/** Day-of-month from an ISO "YYYY-MM-DD". */
export const dayOf = (date: string): number => +date.slice(8, 10);

/** Everything one day cell needs to render itself, precomputed once per month. */
export interface DayCell {
	day: number;
	/** ISO date, so a caller can preset a form without re-deriving it. */
	iso: string;
	txns: DashboardData['months'][string]['transactions'];
	pays: DashboardData['months'][string]['paychecks'];
	xfers: NonNullable<DashboardData['months'][string]['transfers']>;
	spent: number;
	income: number;
	/** Up to three category names, busiest first — the cell's colour dots. */
	cats: string[];
	/** There were more categories than the dots show. */
	more: boolean;
	pending: boolean;
}

/** One week of the grid: seven slots (null either end of the month) and the week's spend. */
export interface WeekRow {
	cells: (DayCell | null)[];
	total: number;
}

/** How many category dots a cell shows before collapsing the rest into a "+". */
const MAX_DOTS = 3;

/** The weekday index (0 = Sunday) that the 1st of a "YYYY-MM" falls on. */
export function firstWeekdayOf(monthKey: string): number {
	const [y, m] = monthKey.split('-').map(Number);
	return new Date(y ?? 1970, (m ?? 1) - 1, 1).getDay();
}

/** How many days a "YYYY-MM" has. Day 0 of the NEXT month is the last day of this one. */
export function daysInMonthOf(monthKey: string): number {
	const [y, m] = monthKey.split('-').map(Number);
	return new Date(y ?? 1970, m ?? 1, 0).getDate();
}

/** Build every day cell for a month, in order. */
export function dayCells(data: DashboardData, monthKey: string): DayCell[] {
	const md = data.months[monthKey];
	const out: DayCell[] = [];

	for (let d = 1; d <= daysInMonthOf(monthKey); d++) {
		const iso = `${monthKey}-${String(d).padStart(2, '0')}`;
		const txns = (md?.transactions ?? []).filter((t) => dayOf(t.date) === d);
		const pays = (md?.paychecks ?? []).filter((p) => dayOf(p.date) === d);
		const xfers = (md?.transfers ?? []).filter((t) => dayOf(t.date) === d);

		// Dots are ranked by spend, not by first appearance, so the biggest category is always shown.
		const catTotals = new Map<string, number>();
		for (const t of txns) catTotals.set(t.category, (catTotals.get(t.category) ?? 0) + t.amount);
		const ranked = [...catTotals.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);

		out.push({
			day: d,
			iso,
			txns,
			pays,
			xfers,
			spent: txns.reduce((a, t) => a + t.amount, 0),
			income: pays.reduce((a, p) => a + p.net, 0),
			cats: ranked.slice(0, MAX_DOTS),
			more: ranked.length > MAX_DOTS,
			pending: txns.some((t) => t.pending) || xfers.some((t) => t.pending)
		});
	}

	return out;
}

/**
 * Lay the cells out a week at a time, padding both ends with blanks so every row has seven slots.
 * Rows carry their own spend total, which is what lets the gutter beside the grid read as a small
 * bar chart of the month.
 */
export function weekRows(cells: DayCell[], firstWeekday: number): WeekRow[] {
	const slots: (DayCell | null)[] = [...Array(firstWeekday).fill(null), ...cells];
	while (slots.length % 7) slots.push(null);

	const out: WeekRow[] = [];
	for (let i = 0; i < slots.length; i += 7) {
		const week = slots.slice(i, i + 7);
		out.push({ cells: week, total: week.reduce((s, c) => s + (c?.spent ?? 0), 0) });
	}
	return out;
}

/** The last day of the month with anything logged on it — the day you'd be logging against. */
export function latestActivityDay(cells: DayCell[]): number {
	let last = 0;
	for (const c of cells) if (c.txns.length || c.pays.length || c.xfers.length) last = c.day;
	return last;
}

/**
 * Where a grid keypress moves to, or null when the key isn't one the grid owns.
 *
 * Arrows step a day or a week; Home and End go to the ends of the WEEK, the way a spreadsheet grid
 * behaves — the month's own ends are one more keypress away, and crossing months belongs to the
 * header's stepper. Movement clamps at the month's edges instead of wrapping, because wrapping from
 * the 31st to the 1st looks like the month changed when it didn't.
 */
export function dayForKey(
	key: string,
	day: number,
	monthKey: string,
	firstWeekday: number
): number | null {
	const dayInWeek = (firstWeekday + day - 1) % 7;
	const deltas: Record<string, number | undefined> = {
		ArrowLeft: -1,
		ArrowRight: 1,
		ArrowUp: -7,
		ArrowDown: 7,
		Home: -dayInWeek,
		End: 6 - dayInWeek
	};

	const delta = deltas[key];
	if (delta === undefined) return null;
	return Math.min(daysInMonthOf(monthKey), Math.max(1, day + delta));
}
