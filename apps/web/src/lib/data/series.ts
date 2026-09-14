// Series & multi-series primitives over the canonical sections. A `MultiSeries` bundles series that
// share an axis and labels, so they overlay.

import type { DashboardData } from '$lib/data/types';
import type { Axis, MultiSeries, Series, SeriesPoint, Unit } from './primitives';
import { MONEY, PERCENT } from './primitives';
import { MONTHS, monthName } from '$lib/utils/format';
import { addMonths, monthKey } from '$lib/utils/period';
import { measureLabel, measureValue, type Field, type Measure } from './metric';

/** Build a Series from parallel labels/values; a null value becomes 0. */
export function series(
	name: string,
	labels: string[],
	values: (number | null)[],
	unit: Unit,
	axis: Axis = 'time'
): Series {
	const points: SeriesPoint[] = labels.map((label, i) => ({ label, value: values[i] ?? 0 }));
	return { kind: 'series', unit, axis, name, points };
}

// --- one measure over time ---
//
// All three read the SAME aggregates the scalar metrics do (`measureValue`): a per-measure builder would
// be a second definition of the measure, free to disagree with the figure beside it.

/** The month keys a monthly series spans, with the labels to plot them under. */
function monthAxis(data: DashboardData, year?: number): { keys: string[]; labels: string[] } {
	if (year == null) return { keys: data.meta.month_keys, labels: data.meta.month_keys };
	return {
		keys: MONTHS.map((_, m) => monthKey(year, m + 1)),
		labels: MONTHS
	};
}

function overMonths(data: DashboardData, m: Measure, keys: string[], labels: string[]): Series {
	return series(
		measureLabel(m),
		labels,
		keys.map((k) => measureValue(data, { level: 'month', monthKey: k }, m)),
		MONEY(data.currency)
	);
}

/** One point per month: a year's twelve, or every tracked month when `year` is omitted. */
export function measureByMonth(data: DashboardData, m: Measure, year?: number): Series {
	const { keys, labels } = monthAxis(data, year);
	return overMonths(data, m, keys, labels);
}

/**
 * Only the months a measure actually moved in, first through last: a quiet month in the middle still
 * plots, a run of empty ones at either end does not. The window a running total wants, which otherwise
 * flatlines to the year's edge.
 */
export function measureActive(data: DashboardData, m: Measure, year: number): Series {
	const { keys } = monthAxis(data, year);
	const moved = keys.map((k) => measureValue(data, { level: 'month', monthKey: k }, m) !== 0);
	const first = moved.indexOf(true);
	const last = moved.lastIndexOf(true);
	const span = first === -1 ? [] : keys.slice(first, last + 1);
	return overMonths(data, m, span, span.map(monthName));
}

/** The trailing `count` months up to and including `monthKey` — a KPI's recent shape. */
export function measureTrailing(
	data: DashboardData,
	m: Measure,
	monthKey: string,
	count = 12
): Series {
	const keys = Array.from({ length: count }, (_, i) => addMonths(monthKey, i - count + 1));
	return overMonths(data, m, keys, keys.map(monthName));
}

/** One point per tracked year. */
export function measureByYear(data: DashboardData, m: Measure): Series {
	const years = data.meta.years;
	return series(
		measureLabel(m),
		years.map(String),
		years.map((y) => measureValue(data, { level: 'year', year: y }, m)),
		MONEY(data.currency),
		'ordinal'
	);
}

/**
 * A series' running total. A transform over any of the above rather than a builder of its own, so
 * which months an accumulation spans is the caller's choice and not baked in here.
 */
export function accumulate(s: Series): Series {
	let run = 0;
	return { ...s, points: s.points.map((p) => ({ ...p, value: (run += p.value ?? 0) })) };
}

// --- composite ---

/**
 * Income / Spent / Saved as one MultiSeries. Lifetime (`year` omitted) plots per tracked year; a
 * specific `year` plots its twelve months.
 */
export function incomeSpentSaved(data: DashboardData, year?: number): MultiSeries {
	const parts: Field[] = ['income', 'spending', 'saved'];
	const list = parts.map((f) =>
		year == null ? measureByYear(data, f) : measureByMonth(data, f, year)
	);

	return {
		kind: 'multiseries',
		unit: MONEY(data.currency),
		axis: 'ordinal',
		labels: list[0]?.points.map((p) => p.label) ?? [],
		// Built as time series above; overlaid on one categorical axis here.
		series: list.map((s) => ({ ...s, axis: 'ordinal' as const }))
	};
}

/**
 * One series per spending category across the tracked years, ordered by lifetime total so the
 * right-edge labels and tooltip read by magnitude. Categories span orders of magnitude, so this is
 * drawn on a log axis — see `logYScale`.
 */
export function categorySpendByYear(data: DashboardData): MultiSeries {
	const unit = MONEY(data.currency);
	const years = data.meta.years;
	const labels = years.map(String);

	const totalFor = (year: number, cat: string) =>
		(data.years[String(year)]?.matrix ?? []).reduce((s, row) => s + (row.spent[cat] ?? 0), 0);

	// Only categories with spend somewhere in the range: a closed category still shows its history,
	// and one that never had spend never draws a flat line along the axis.
	const cats = data.meta.categories
		.map((c) => ({ c, values: years.map((y) => totalFor(y, c)) }))
		.map((e) => ({ ...e, lifetime: e.values.reduce((a, b) => a + b, 0) }))
		.filter((e) => e.lifetime > 0)
		.sort((a, b) => b.lifetime - a.lifetime);

	return {
		kind: 'multiseries',
		unit,
		axis: 'ordinal',
		labels,
		series: cats.map((e) => series(e.c, labels, e.values, unit, 'ordinal'))
	};
}

/**
 * Savings-to-income ratio per year, as a percentage. Divided out of the two measures rather than
 * from the yearly rows directly, so the line and the savings-rate figure beside it are the same
 * definition of the ratio.
 */
export function savingsRate(data: DashboardData): Series {
	const saved = measureByYear(data, 'saved');
	const income = measureByYear(data, 'income');
	return {
		...saved,
		name: 'Savings rate',
		unit: PERCENT,
		points: saved.points.map((p, i) => {
			const base = income.points[i]?.value ?? 0;
			return { ...p, value: base ? ((p.value ?? 0) / base) * 100 : 0 };
		})
	};
}
