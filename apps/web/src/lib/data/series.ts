// Series & multi-series primitives over the canonical sections. A `MultiSeries` bundles series that
// share an axis and labels, so they overlay.

import type { DashboardData } from '$lib/data/types';
import type { Axis, MultiSeries, Series, SeriesPoint, Unit } from './primitives';
import { MONEY, PERCENT } from './primitives';
import { MONTHS, monthName } from '$lib/utils/format';
import { sum, sumBy } from '$lib/utils/num';
import { addMonths, monthKey } from '$lib/utils/period';
import { measureLabel, measureValue, type Field, type Measure } from './metric';

/** A second reading of the same points, for `series` to carry alongside the first. */
interface Alt {
	unit: Unit;
	values: (number | null)[];
}

/** Build a Series from parallel labels/values; a null value becomes 0. */
export function series(
	name: string,
	labels: string[],
	values: (number | null)[],
	unit: Unit,
	axis: Axis = 'time',
	alt?: Alt
): Series {
	const points: SeriesPoint[] = labels.map((label, i) => ({
		label,
		value: values[i] ?? 0,
		alt: alt ? (alt.values[i] ?? 0) : undefined
	}));
	return { kind: 'series', unit, axis, name, points, altUnit: alt?.unit };
}

/** Series that overlay, bundled under the axis and labels they share. */
export function multiseries(unit: Unit, axis: Axis, labels: string[], list: Series[]): MultiSeries {
	return { kind: 'multiseries', unit, axis, labels, series: list };
}

// --- one measure over time ---
//
// All read through `measureValue`, so a chart cannot disagree with the figure beside it.

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

/** The months a measure moved in, first through last. A running total otherwise flatlines to the edge. */
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

/** A series' running total. A transform, so the caller chooses which months the accumulation spans. */
export function accumulate(s: Series): Series {
	let run = 0;
	return { ...s, points: s.points.map((p) => ({ ...p, value: (run += p.value ?? 0) })) };
}

// --- composite ---

/**
 * The cash-flow measures as one MultiSeries. Lifetime (`year` omitted) plots per tracked year; a
 * specific `year` plots its twelve months. `net` rather than `income` so it reads from the same
 * paycheck rows take-home does.
 */
export function cashFlowBars(data: DashboardData, year?: number): MultiSeries {
	const parts: Field[] = ['net', 'takehome', 'spending', 'saved'];
	const list = parts.map((f) =>
		year == null ? measureByYear(data, f) : measureByMonth(data, f, year)
	);

	return multiseries(
		MONEY(data.currency),
		'ordinal',
		list[0]?.points.map((p) => p.label) ?? [],
		list.map((s) => ({ ...s, axis: 'ordinal' as const }))
	);
}

/**
 * One series per spending category across the tracked years, ordered by lifetime total. Categories span
 * orders of magnitude, so this wants a log axis — see `logYScale`.
 */
export function categorySpendByYear(data: DashboardData): MultiSeries {
	const unit = MONEY(data.currency);
	const years = data.meta.years;
	const labels = years.map(String);

	const totalFor = (year: number, cat: string) =>
		sumBy(data.years[String(year)]?.matrix ?? [], (row) => row.spent[cat] ?? 0);

	// Spend somewhere in the range, so a closed category keeps its history and an unused one is dropped.
	const cats = data.meta.categories
		.map((c) => ({ c, values: years.map((y) => totalFor(y, c)) }))
		.map((e) => ({ ...e, lifetime: sum(e.values) }))
		.filter((e) => e.lifetime > 0)
		.sort((a, b) => b.lifetime - a.lifetime);

	return multiseries(
		unit,
		'ordinal',
		labels,
		cats.map((e) => series(e.c, labels, e.values, unit, 'ordinal'))
	);
}

/** Savings-to-income ratio per year, as a percentage. */
export function savingsRate(data: DashboardData): Series {
	const saved = measureByYear(data, 'saved');
	const income = measureByYear(data, 'income');
	const total = (s: Series) => sumBy(s.points, (p) => p.value ?? 0);
	const lifetimeIncome = total(income);
	return {
		...saved,
		name: 'Savings rate',
		unit: PERCENT,
		points: saved.points.map((p, i) => {
			const base = income.points[i]?.value ?? 0;
			return { ...p, value: base ? ((p.value ?? 0) / base) * 100 : 0 };
		}),
		// The lifetime rate, not the mean of the yearly ones: a bigger year has more say in "usual".
		reference: lifetimeIncome
			? { value: (total(saved) / lifetimeIncome) * 100, label: 'lifetime' }
			: undefined
	};
}
