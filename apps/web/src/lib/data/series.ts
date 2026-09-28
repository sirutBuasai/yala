// Series & multi-series primitives over the canonical sections. A `MultiSeries` bundles series that
// share an axis and labels, so they overlay.

import type { DashboardData } from '$lib/data/types';
import type { Axis, MultiSeries, Series, SeriesPoint, Unit } from './primitives';
import { MONEY, PERCENT } from './primitives';
import { priorMonths } from './scope';
import { MONTHS, monthName } from '$lib/utils/format';
import { sum, sumBy } from '$lib/utils/num';
import { addMonths, daysIn, isoDate, monthKey } from '$lib/utils/period';
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
export function multiseries(
	unit: Unit,
	axis: Axis,
	labels: string[],
	list: Series[],
	periods?: string[]
): MultiSeries {
	return { kind: 'multiseries', unit, axis, labels, series: list, periods };
}

// All read through `measureValue`, so a chart can't disagree with its figure.

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

/** Every year from the first tracked (or `since`, when later) to the last, so a year with nothing logged
    still holds its place on an axis rather than closing the gap. */
export function yearAxis(data: DashboardData, since?: number): number[] {
	return spanYears(data.meta.years, since);
}

/** Every year from the first of `ys` (or `since`, when later) to the last, gaps included. */
export function spanYears(ys: number[], since?: number): number[] {
	if (!ys.length) return [];
	const first = Math.max(Math.min(...ys), since ?? -Infinity);
	return Array.from({ length: Math.max(0, Math.max(...ys) - first + 1) }, (_, i) => first + i);
}

/** One point per year, gaps included. */
export function measureByYear(data: DashboardData, m: Measure, since?: number): Series {
	const years = yearAxis(data, since);
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

/** Per year from `since`, or a `year`'s months. `net`, not `income`, so it reads the paycheck rows take-home
    does. */
export function cashFlowBars(data: DashboardData, year?: number, since?: number): MultiSeries {
	const parts: Field[] = ['net', 'takehome', 'spending', 'saved'];
	const list = parts.map((f) =>
		year == null ? measureByYear(data, f, since) : measureByMonth(data, f, year)
	);

	return multiseries(
		MONEY(data.currency),
		'ordinal',
		list[0]?.points.map((p) => p.label) ?? [],
		list.map((s) => ({ ...s, axis: 'ordinal' as const }))
	);
}

/** Ordered by total. Categories span orders of magnitude, so this wants a log axis (see `logYScale`). */
export function categorySpendByYear(data: DashboardData, since?: number): MultiSeries {
	const unit = MONEY(data.currency);
	const years = yearAxis(data, since);
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
export function savingsRate(data: DashboardData, since?: number): Series {
	const saved = measureByYear(data, 'saved', since);
	const income = measureByYear(data, 'income', since);
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
		// The rate over every year shown, not the mean of the yearly ones: a bigger year has more say in
		// "usual".
		reference: lifetimeIncome
			? {
					value: (total(saved) / lifetimeIncome) * 100,
					label: since == null ? 'lifetime' : 'average'
				}
			: undefined
	};
}

type MonthPage = DashboardData['months'][string];

/** What a pace sums: each entry's date and its amount. */
type Entries = (page: MonthPage) => { date: string; amount: number }[];

/** A month's entries summed up to each day. A day past the month's end reads its last day, so a short
    month can be compared against a long one. */
function running(data: DashboardData, key: string, entries: Entries): (day: number) => number {
	const days = daysIn(key);
	const cum = new Array<number>(days + 1).fill(0);
	const page = data.months[key];
	for (const e of page ? entries(page) : []) cum[Number(e.date.slice(8))]! += e.amount;
	for (let d = 1; d <= days; d++) cum[d]! += cum[d - 1]!;
	return (day) => cum[Math.min(day, days)]!;
}

/** A month's `entries` run up day by day, against the month before and the mean of its prior months, each
    summed to the same day. `through` ends the month's own line there, as today does in a running month. */
function pace(
	data: DashboardData,
	key: string,
	name: string,
	entries: Entries,
	through?: string
): MultiSeries {
	const unit = MONEY(data.currency);
	const days = Array.from({ length: daysIn(key) }, (_, i) => i + 1);
	const labels = days.map(String);
	const until = through?.startsWith(key) ? Number(through.slice(8)) : Infinity;

	const now = running(data, key, entries);
	const last = running(data, addMonths(key, -1), entries);
	const prior = priorMonths(data, key).map((k) => running(data, k, entries));

	const line = (label: string, value: (day: number) => number | null): Series => ({
		kind: 'series',
		unit,
		axis: 'time',
		name: label,
		points: days.map((d, i) => ({ label: labels[i]!, value: value(d) }))
	});

	return multiseries(
		unit,
		'time',
		labels,
		[
			line(name, (d) => (d <= until ? now(d) : null)),
			line('Last month', last),
			line('Average', (d) => (prior.length ? sum(prior.map((f) => f(d))) / prior.length : null))
		],
		days.map((d) => isoDate(key, d))
	);
}

/** Spending run up day by day, refunds netted as Spent nets them (`Spent`). */
export function spendingPace(data: DashboardData, key: string, through?: string): MultiSeries {
	return pace(data, key, 'Spent', (page) => page.transactions, through);
}

/** Net income, after tax and deductions, run up day by day as paychecks land (`Net income`). */
export function earningPace(data: DashboardData, key: string, through?: string): MultiSeries {
	return pace(
		data,
		key,
		'Net income',
		(page) => page.paychecks.map((p) => ({ date: p.date, amount: p.net })),
		through
	);
}
