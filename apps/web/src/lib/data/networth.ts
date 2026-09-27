// Net-worth primitives over the `networth` section: the snapshot trend, allocation, the growth
// decomposition, and the targets derived from logged spending.

import type { DashboardData, NetWorthSnapshot } from '$lib/data/types';
import type {
	Bullet,
	BulletRow,
	Categorical,
	MultiSeries,
	Scalar,
	Series,
	Table,
	TableColumn,
	TintDirection,
	Tone,
	Unit
} from './primitives';
import { MONEY, MONTHS, PERCENT, scalar } from './primitives';
import { assumptionsOf, realRate, yearsToRetirement, type Assumptions } from './assumptions';
import { categorical } from './categorical';
import { multiseries, series, spanYears } from './series';
import {
	activeMonthsIn,
	activeMonthsNote,
	measureValue,
	percentDelta,
	trackedYearsNote
} from './metric';
import { type Scope, scopeYear } from './scope';
import { dateShort, money, monthLabel, monthName } from '$lib/utils/format';
import { sumBy } from '$lib/utils/num';
import { addMonths, yearOf } from '$lib/utils/period';
import { live, words, type Label } from '$lib/ui/label';

export type SnapshotField = 'net_worth' | 'assets' | 'liabilities';

/** The name each field is drawn under, which is also what the registry colours it by. */
const FIELD_NAME: Record<SnapshotField, string> = {
	net_worth: 'Net worth',
	assets: 'Assets',
	liabilities: 'Liabilities'
};

/** Which way each level reads as good news. Owing more is the one that runs the other way. */
const UP_IS_GOOD: Record<SnapshotField, TintDirection> = {
	net_worth: 'up-good',
	assets: 'up-good',
	liabilities: 'up-bad'
};

/** Allocation buckets in display order (mirrors the backend `BUCKETS`). */
const BUCKETS = ['Liquid', 'Taxable', 'Tax-advantaged'];

/** Years a KPI's yearly underlay looks back over. */
const WINDOW_YEARS = 10;

function snapshots(data: DashboardData): NetWorthSnapshot[] {
	return data.networth?.series ?? [];
}

/** The month of the latest snapshot, which today's balances were logged in; '' before any. */
export function latestSnapshotMonth(data: DashboardData): string {
	return snapshots(data).at(-1)?.date.slice(0, 7) ?? '';
}

/** Every year a snapshot falls in, ascending. */
export function snapshotYears(data: DashboardData): number[] {
	return [...new Set(snapshots(data).map((p) => yearOf(p.date)))];
}

function forYear(data: DashboardData, year: number): NetWorthSnapshot[] {
	return snapshots(data).filter((p) => p.date.startsWith(`${year}-`));
}

/** Months of a year holding at least one snapshot, ascending — the months a change can be bounded in. */
function snapshotMonths(data: DashboardData, year: number): string[] {
	return [...new Set(forYear(data, year).map((p) => p.date.slice(0, 7)))];
}

function assetAccounts(data: DashboardData) {
	return (data.networth?.accounts ?? []).filter((a) => a.group !== 'liability');
}

/** The snapshots a scope plots, and how their dates read on an axis. A year states the day, since two
    balances can be logged in one month; a lifetime run only has room for the month. */
function axisOf(
	data: DashboardData,
	year?: number,
	since?: number
): { points: NetWorthSnapshot[]; labels: string[]; periods: string[] } {
	const points =
		year == null
			? snapshots(data).filter((p) => since == null || yearOf(p.date) >= since)
			: forYear(data, year);
	const label = year == null ? monthLabel : dateShort;
	return { points, labels: points.map((p) => label(p.date)), periods: points.map((p) => p.date) };
}

/** One snapshot field per logged snapshot — lifetime (`year` omitted) or one year's. */
function snapshotSeries(
	data: DashboardData,
	field: SnapshotField,
	year?: number,
	since?: number
): Series {
	const { points, labels, periods } = axisOf(data, year, since);
	return {
		...series(
			FIELD_NAME[field],
			labels,
			points.map((p) => p[field]),
			MONEY(data.currency)
		),
		periods
	};
}

function bySign(value: number): Tone {
	return value >= 0 ? 'good' : 'bad';
}

/** A current-value scalar; net worth also carries its change since the previous snapshot. */
export function netWorthScalar(
	data: DashboardData,
	field: SnapshotField,
	label: Label,
	scope: Scope = { level: 'all' }
): Scalar {
	const unit = MONEY(data.currency);
	/** A level's move, toned by which way is good for it: a debt growing is bad. */
	const moved = (change: number, note: string): Scalar['delta'] => {
		const good = READING[field].tint === 'up-good' ? change >= 0 : change <= 0;
		return { value: change, unit, tone: good ? 'good' : 'bad', note };
	};
	if (scope.level === 'year') {
		const w = bounds(data, scope);
		const s = scalar(unit, label, w.close?.[field] ?? null);
		if (w.open && w.close && w.open !== w.close) {
			s.delta = moved(w.close[field] - w.open[field], 'this year');
		}
		return s;
	}
	const current = data.networth?.current ?? null;
	const value = current ? current[field] : null;
	const s = scalar(unit, label, value);
	const prev = previousSnapshot(data);
	if (prev && value != null) s.delta = moved(value - prev[field], 'since last');
	return s;
}

/** The snapshot before today's reading. `current` may share its date with the last series point, which is
    skipped so a delta is never a reading against itself. */
function previousSnapshot(data: DashboardData): NetWorthSnapshot | undefined {
	const current = data.networth?.current;
	const points = snapshots(data);
	const last = points.at(-1);
	return last && current && last.date === current.date ? points.at(-2) : last;
}

export function netWorthByMonth(data: DashboardData, year?: number): Series {
	return snapshotSeries(data, 'net_worth', year);
}

/** Net worth and assets over time; the gap between them is what is owed. */
export function netWorthVsAssets(data: DashboardData, year?: number, since?: number): MultiSeries {
	const unit = MONEY(data.currency);
	const { points, labels, periods } = axisOf(data, year, since);

	return multiseries(
		unit,
		'time',
		labels,
		(['net_worth', 'assets'] as SnapshotField[]).map((field) =>
			series(
				FIELD_NAME[field],
				labels,
				points.map((p) => p[field]),
				unit
			)
		),
		periods
	);
}

/** A snapshot field at each logged year's close, most recent `WINDOW_YEARS` only: past that the recent
    years are too thin to tell apart in a KPI underlay. */
export function netWorthByYear(data: DashboardData, field: SnapshotField): Series {
	const years = snapshotYears(data).slice(-WINDOW_YEARS);
	return series(
		FIELD_NAME[field],
		years.map(String),
		years.map((year) => bounds(data, { level: 'year', year }).close?.[field] ?? null),
		MONEY(data.currency)
	);
}

/** Liabilities over time on their own; illegible as a third line against a net-worth axis. */
export function netWorthLiabilities(data: DashboardData, year?: number, since?: number): Series {
	return snapshotSeries(data, 'liabilities', year, since);
}

// --- a period's move, read the same way wherever it is drawn ---

interface Window {
	open: NetWorthSnapshot | null;
	close: NetWorthSnapshot | null;
}

/** One window per period, labelled for an ordinal axis or a table's first column. */
interface Run {
	labels: string[];
	periods: string[];
	windows: Window[];
}

/** One named figure a snapshot carries, plus which direction of its move reads as good news. */
interface Reading {
	name: string;
	of: (p: NetWorthSnapshot) => number;
	tint: TintDirection;
}

const READING: Record<SnapshotField, Reading> = {
	net_worth: { name: FIELD_NAME.net_worth, of: (p) => p.net_worth, tint: UP_IS_GOOD.net_worth },
	assets: { name: FIELD_NAME.assets, of: (p) => p.assets, tint: UP_IS_GOOD.assets },
	liabilities: {
		name: FIELD_NAME.liabilities,
		of: (p) => p.liabilities,
		tint: UP_IS_GOOD.liabilities
	}
};

const LEVELS: Reading[] = [READING.net_worth, READING.assets, READING.liabilities];

/** The two levels that can share one chart. Liabilities are drawn on their own: they move by hundreds of
    dollars against tens of thousands, and by hundreds of percent against single digits. */
const PAIRED: Reading[] = [READING.net_worth, READING.assets];

/** More of any asset type is good news, so every bucket's change reads the same way. */
const HOLDINGS: Reading[] = BUCKETS.map((bucket) => ({
	name: bucket,
	of: (p: NetWorthSnapshot) => p.breakdown[bucket] ?? 0,
	tint: 'up-good' as TintDirection
}));

/** A move as a percentage of where the period opened. Off the magnitude, so a negative opening balance
    doesn't flip the sign away from the actual movement. */
function pctOf(delta: number, open: number): number {
	return open ? (delta / Math.abs(open)) * 100 : 0;
}

/** A reading's move over one window, in both units at once so the pair cannot drift apart. */
function move(w: Window, r: Reading): { value: number; percent: number } {
	if (!w.open || !w.close) return { value: 0, percent: 0 };

	const delta = r.of(w.close) - r.of(w.open);
	return { value: delta, percent: pctOf(delta, r.of(w.open)) };
}

/** A year's months as a run — month over month, so the freshest reading counts. See `monthOverMonth`. */
function monthlyRun(data: DashboardData, year: number): Run {
	const keys = snapshotMonths(data, year);
	return {
		labels: keys.map(monthName),
		periods: keys,
		windows: keys.map((k) => monthOverMonth(data, k))
	};
}

/** The years a window of the record reads, gaps kept: the lifetime when `since` is absent. */
function windowYears(data: DashboardData, since?: number): number[] {
	return spanYears(snapshotYears(data), since);
}

function yearlyRun(data: DashboardData, since?: number): Run {
	const years = windowYears(data, since);

	return {
		labels: years.map(String),
		periods: years.map(String),
		windows: years.map((year) => bounds(data, { level: 'year', year }))
	};
}

/** Each snapshot of a year against the one logged before it, wherever that fell. */
function snapshotRun(data: DashboardData, year: number): Run {
	const all = snapshots(data);
	const points = forYear(data, year);

	return {
		labels: points.map((p) => dateShort(p.date)),
		periods: points.map((p) => p.date),
		windows: points.map((p) => {
			const i = all.findIndex((q) => q.date === p.date);
			return { open: i > 0 ? all[i - 1]! : null, close: p };
		})
	};
}

/** One series per reading. `axis` picks which unit the chart plots; the other rides along as the points'
    alternate reading, so one chart answers both "how much" and "what fraction". */
function moveSeries(
	data: DashboardData,
	run: Run,
	readings: Reading[],
	axis: 'value' | 'percent'
): MultiSeries {
	const cash = MONEY(data.currency);
	const unit = axis === 'percent' ? PERCENT : cash;
	const altUnit = axis === 'percent' ? cash : PERCENT;
	const other = axis === 'percent' ? 'value' : 'percent';

	return multiseries(
		unit,
		'ordinal',
		run.labels,
		readings.map((r) => {
			const moves = run.windows.map((w) => move(w, r));
			return series(
				r.name,
				run.labels,
				moves.map((m) => m[axis]),
				unit,
				'ordinal',
				{ unit: altUnit, values: moves.map((m) => m[other]) }
			);
		}),
		run.periods
	);
}

/** `<name> | Change | Change %` per reading, after the column naming the period. Only the change columns
    are shaded: a balance has no good or bad direction, only its movement does. */
function deltaColumns(period: string, readings: Reading[], unit: Unit): TableColumn[] {
	return [
		{ label: period },
		...readings.flatMap((r) => [
			{ label: r.name, unit },
			{ label: 'Change', unit, tint: r.tint },
			{ label: 'Change %', unit: PERCENT, tint: r.tint }
		])
	];
}

function deltaTable(data: DashboardData, period: string, run: Run, readings: Reading[]): Table {
	return {
		kind: 'table',
		columns: deltaColumns(period, readings, MONEY(data.currency)),
		periods: run.periods,
		rows: run.labels.map((label, i) => {
			const w = run.windows[i]!;
			return [
				label,
				...readings.flatMap((r) => {
					const m = move(w, r);
					return [w.close ? r.of(w.close) : 0, m.value, m.percent];
				})
			];
		})
	};
}

/** A year's snapshots, each level beside its change since the previous one. Every level gets its own
    pair: the three do not move together, since assets can rise on a month a card was also paid. */
export function netWorthMonthlyTable(data: DashboardData, year: number): Table {
	return deltaTable(data, 'Date', snapshotRun(data, year), LEVELS);
}

export function netWorthAssetsChange(data: DashboardData, year: number): MultiSeries {
	return moveSeries(data, monthlyRun(data, year), PAIRED, 'percent');
}

/** The same two levels a year at a time: whether growth is speeding up or slowing as the base grows,
    which the dollar decomposition beside it cannot say. */
export function netWorthAssetsChangeByYear(data: DashboardData, since?: number): MultiSeries {
	return moveSeries(data, yearlyRun(data, since), PAIRED, 'percent');
}

// Liabilities take an axis of their own, for the reason `PAIRED` gives.
export function liabilitiesChangeByYear(data: DashboardData, since?: number): MultiSeries {
	return moveSeries(data, yearlyRun(data, since), [READING.liabilities], 'percent');
}

export function liabilitiesChange(data: DashboardData, year: number): MultiSeries {
	return moveSeries(data, monthlyRun(data, year), [READING.liabilities], 'percent');
}

/** Dollars on the axis, not percent: the buckets are parts of one total, so their moves compare directly,
    where a percentage would make the smallest bucket's swings the loudest. */
export function bucketChangeByMonth(data: DashboardData, year: number): MultiSeries {
	return moveSeries(data, monthlyRun(data, year), HOLDINGS, 'value');
}

export function bucketChangeByYear(data: DashboardData, since?: number): MultiSeries {
	return moveSeries(data, yearlyRun(data, since), HOLDINGS, 'value');
}

export function bucketMonthlyTable(data: DashboardData, year: number): Table {
	return deltaTable(data, 'Date', snapshotRun(data, year), HOLDINGS);
}

export function bucketYearTable(data: DashboardData, since?: number): Table {
	return deltaTable(data, 'Year', yearlyRun(data, since), HOLDINGS);
}

/** Net worth's percent move per logged year. Named for the rate rather than the balance, so the registry
    gives it its own hue instead of net worth's. */
export function growthRateByYear(data: DashboardData, since?: number): Series {
	const run = yearlyRun(data, since);
	return series(
		'Balance growth',
		run.labels,
		run.windows.map((w) => move(w, READING.net_worth).percent),
		PERCENT,
		'ordinal'
	);
}

/** One band per bucket, `of` deciding whether a band's thickness is a share of assets or the balance
    itself. Whichever it is not rides along as the points' alternate reading. */
function allocation(
	data: DashboardData,
	of: 'share' | 'value',
	year?: number,
	since?: number
): MultiSeries {
	const cash = MONEY(data.currency);
	const unit = of === 'share' ? PERCENT : cash;
	const altUnit = of === 'share' ? cash : PERCENT;
	const { points, labels, periods } = axisOf(data, year, since);

	const held = (p: NetWorthSnapshot, b: string) => p.breakdown[b] ?? 0;
	const share = (p: NetWorthSnapshot, b: string) => (p.assets ? (held(p, b) / p.assets) * 100 : 0);
	const read = of === 'share' ? share : held;
	const other = of === 'share' ? held : share;

	return multiseries(
		unit,
		'time',
		labels,
		BUCKETS.map((b) =>
			series(
				b,
				labels,
				points.map((p) => read(p, b)),
				unit,
				'time',
				{ unit: altUnit, values: points.map((p) => other(p, b)) }
			)
		),
		periods
	);
}

export function netWorthAllocationShare(
	data: DashboardData,
	year?: number,
	since?: number
): MultiSeries {
	return allocation(data, 'share', year, since);
}

/** Each bucket's balance over time. The share view normalizes every column to 100%, so only this one
    says whether a band thinned because it shrank or because another grew. */
export function netWorthAllocationValue(
	data: DashboardData,
	year?: number,
	since?: number
): MultiSeries {
	return allocation(data, 'value', year, since);
}

/** Every asset account by value, largest first; a liability has no share to draw. Labelled by display
    name but coloured by ledger path, which is what the colour map is keyed by. */
export function netWorthAccounts(data: DashboardData): Categorical {
	return categorical(
		assetAccounts(data).map((a) => ({
			category: a.label,
			amount: a.value,
			colorKey: a.account
		})),
		MONEY(data.currency),
		999
	);
}

// --- growth decomposition ---
//
//     ΔNetWorth = saved + everything-else,  saved = logged income - logged spending
//
// One remainder term: a snapshot's pad absorbs market growth and unlogged flow alike.

/** The half-open span of dates a scope covers: `[start, next)`. */
function span(data: DashboardData, scope: Scope): { start: string; next: string } {
	// A window runs from its first year to past the last snapshot, so it closes on the latest.
	if (scope.level === 'all') return { start: `${scope.since}-01-01`, next: '9999-12-31' };
	if (scope.level === 'month') {
		const key = scope.monthKey ?? '';
		return { start: `${key}-01`, next: `${addMonths(key, 1)}-01` };
	}

	const year = scopeYear(data, scope);
	return { start: `${year}-01-01`, next: `${year + 1}-01-01` };
}

/** A snapshot dated a period's first day is its opening balance, so the period closes on the next one's.
    Closing on the last snapshot inside it set each move against the next period's saving. */
function bounds(data: DashboardData, scope: Scope): Window {
	const all = snapshots(data);
	if (scope.level === 'all' && scope.since == null) {
		return { open: all[0] ?? null, close: all[all.length - 1] ?? null };
	}

	const { start, next } = span(data, scope);
	const upTo = (date: string) => all.filter((p) => p.date <= date).at(-1) ?? null;
	// A period that begins before anything was logged opens at its own first snapshot instead, so the
	// first tracked year still reports a move rather than nothing.
	const inside = all.filter((p) => p.date > start && p.date <= next);

	return { open: upTo(start) ?? inside[0] ?? null, close: upTo(next) };
}

/** Freshest reading in the prior month to the freshest in this one, so a mid-month reading counts. Unlike
    `bounds`, these bars don't sum to the year figures. */
function monthOverMonth(data: DashboardData, monthKey: string): Window {
	const all = snapshots(data);
	const latestIn = (key: string) => all.filter((p) => p.date.startsWith(key)).at(-1) ?? null;
	// Falls back to the last snapshot before this month where the one before it has none, so a gap in
	// logging shortens the bar rather than dropping it.
	const before = all.filter((p) => p.date < `${monthKey}-01`).at(-1) ?? null;

	return { open: latestIn(addMonths(monthKey, -1)) ?? before, close: latestIn(monthKey) };
}

/** Months whose 1st falls in `[open, close)`, since a snapshot on the 1st predates that month's money. */
function savedBetween(data: DashboardData, open: string, close: string): number {
	return sumBy(
		data.meta.month_keys.filter((key) => `${key}-01` >= open && `${key}-01` < close),
		(monthKey) => measureValue(data, { level: 'month', monthKey }, 'saved')
	);
}

/** A month-over-month bar's decomposition, over the window `monthOverMonth` spans. */
function momParts(data: DashboardData, monthKey: string): Record<GrowthPart, number> {
	const { open, close } = monthOverMonth(data, monthKey);
	if (!open || !close) return { change: 0, saved: 0, other: 0 };

	const change = close.net_worth - open.net_worth;
	const saved = savedBetween(data, open.date, close.date);
	return { change, saved, other: change - saved };
}

/** The whole move, and the two parts that sum to it. `change` is the growth itself, not a part of it. */
export type GrowthPart = 'change' | 'saved' | 'other';

/** The snapshots a scope's move is read between. A month reads its bar's window, so a card narrowed to a
    month agrees with the bar it was picked from. */
function windowOf(data: DashboardData, scope: Scope): Window {
	return scope.level === 'month' ? monthOverMonth(data, scope.monthKey ?? '') : bounds(data, scope);
}

/** A scope's growth, split. One source, so a card, a bar and a matrix cell cannot disagree. */
function growthParts(data: DashboardData, scope: Scope): Record<GrowthPart, number> {
	if (scope.level === 'month') return momParts(data, scope.monthKey ?? '');
	const { open, close } = bounds(data, scope);
	const change = open && close ? close.net_worth - open.net_worth : 0;
	const saved = measureValue(data, scope, 'saved');
	return { change, saved, other: change - saved };
}

function shareNote(part: number, change: number, fallback: string): Label {
	return change ? live(`${Math.round((part / change) * 100)}% of the change`) : words(fallback);
}

/** Net worth at the end of a scope, with its change over that scope as a delta. */
export function netWorthChange(data: DashboardData, scope: Scope): Scalar {
	const unit = MONEY(data.currency);
	const { open, close } = windowOf(data, scope);
	const value = close?.net_worth ?? null;
	const s = scalar(unit, words('Net worth'), value);

	if (open && close && open !== close) {
		const delta = close.net_worth - open.net_worth;
		s.delta = {
			value: delta,
			unit,
			tone: bySign(delta),
			note:
				scope.level === 'all'
					? scope.since == null
						? 'since first snapshot'
						: `since ${scope.since}`
					: `this ${scope.level}`
		};
	}

	return s;
}

/** How much of the scope's change in net worth came from logged saving. */
export function netWorthSaved(data: DashboardData, scope: Scope): Scalar {
	const { change, saved } = growthParts(data, scope);

	return scalar(MONEY(data.currency), words('Saved'), saved, {
		tone: bySign(saved),
		note: shareNote(saved, change, 'income - spending')
	});
}

/** The rest of the scope's change: market movement plus anything that wasn't logged. */
export function netWorthOther(data: DashboardData, scope: Scope): Scalar {
	const label = words('Market & other');
	const { open, close } = windowOf(data, scope);
	if (!open || !close) return scalar(MONEY(data.currency), label, null);

	const { change, other } = growthParts(data, scope);

	return scalar(MONEY(data.currency), label, other, {
		tone: bySign(other),
		note: shareNote(other, change, 'growth + unlogged flow')
	});
}

/** The two terms over a run of periods, named the way the registry colours them. `parts` differs between
    the yearly and the month-over-month readings. */
function growthSeries(
	data: DashboardData,
	labels: string[],
	periods: string[],
	parts: Record<GrowthPart, number>[]
): MultiSeries {
	const unit = MONEY(data.currency);
	const read = (part: GrowthPart) => parts.map((p) => p[part]);

	return multiseries(
		unit,
		'ordinal',
		labels,
		[
			series('Saved', labels, read('saved'), unit),
			series('Market & other', labels, read('other'), unit)
		],
		periods
	);
}

export function savedVsOther(data: DashboardData, since?: number): MultiSeries {
	const years = windowYears(data, since).map(String);
	return growthSeries(
		data,
		years,
		years,
		years.map((year) => growthParts(data, { level: 'year', year: Number(year) }))
	);
}

/** Saved vs everything-else per month of one year: which months were yours and which the market's, where
    the yearly view can only say who won the year. Month over month — see `monthOverMonth`. */
export function savedVsOtherByMonth(data: DashboardData, year: number): MultiSeries {
	const keys = snapshotMonths(data, year);
	return growthSeries(
		data,
		keys.map(monthName),
		keys,
		keys.map((monthKey) => growthParts(data, { level: 'month', monthKey }))
	);
}

/** One term per month of a year, for the mark behind a KPI card. Reads the same window as the pane. */
export function growthByMonth(
	data: DashboardData,
	year: number,
	part: GrowthPart,
	name: string
): Series {
	const keys = snapshotMonths(data, year);
	return series(
		name,
		keys.map(monthName),
		keys.map((monthKey) => momParts(data, monthKey)[part]),
		MONEY(data.currency),
		'ordinal'
	);
}

/** The decomposition as a matrix column reads it: the level, and at year scope its move against last
    year's. Lifetime carries no badge, having no prior lifetime to compare with. */
export function netWorthGrowth(
	data: DashboardData,
	scope: Scope,
	part: GrowthPart,
	label: Label
): Scalar {
	const now = growthParts(data, scope)[part];
	const s = scalar(MONEY(data.currency), label, now);

	if (scope.level === 'year') {
		const before = growthParts(data, { level: 'year', year: scopeYear(data, scope) - 1 })[part];
		s.delta = percentDelta(now, before, bySign(now - before), 'YoY');
	}

	return s;
}

/** A growth part averaged over the years it spanned — the lifetime matrix's per-year row. */
export function netWorthGrowthPerYear(
	data: DashboardData,
	scope: Scope,
	part: GrowthPart,
	label: Label
): Scalar {
	const years = windowYears(data, scope.since).length || 1;

	return scalar(MONEY(data.currency), label, growthParts(data, scope)[part] / years, {
		note: trackedYearsNote(years)
	});
}

/** The same term as a monthly run-rate. Judged rate against rate, so a part-finished year does not read
    as a collapse. */
export function netWorthGrowthPerMonth(
	data: DashboardData,
	scope: Scope,
	part: GrowthPart,
	label: Label
): Scalar {
	const months = (s: Scope) => activeMonthsIn(data, s) || 1;
	const rate = (s: Scope) => growthParts(data, s)[part] / months(s);

	const now = rate(scope);
	const out = scalar(MONEY(data.currency), label, now, {
		note: activeMonthsNote(months(scope))
	});

	if (scope.level === 'year') {
		const before = rate({ level: 'year', year: scopeYear(data, scope) - 1 });
		out.delta = percentDelta(now, before, bySign(now - before), 'YoY');
	}

	return out;
}

/** Where a year's growth part lands at its monthly run-rate held for twelve months, against last year's
    whole total: how a year still running is heading. */
export function netWorthGrowthPace(
	data: DashboardData,
	scope: Scope,
	part: GrowthPart,
	label: Label
): Scalar {
	const year = scopeYear(data, scope);
	const now = (growthParts(data, scope)[part] / (activeMonthsIn(data, scope) || 1)) * 12;
	const before = growthParts(data, { level: 'year', year: year - 1 })[part];
	const s = scalar(MONEY(data.currency), label, now);
	s.delta = percentDelta(now, before, bySign(now - before), 'YoY');
	return s;
}

/** The monthly table's shape plus the decomposition only a whole year can carry. */
export function netWorthYearTable(data: DashboardData, since?: number): Table {
	const unit = MONEY(data.currency);
	const run = yearlyRun(data, since);
	const table = deltaTable(data, 'Year', run, LEVELS);

	return {
		...table,
		// These two add to the net-worth Change column above, which is why they carry no percentage of their
		// own: a share of the change is what the pane above the table is for.
		columns: [
			...table.columns,
			{ label: 'Saved', unit, tint: 'up-good' },
			{ label: 'Market & other', unit, tint: 'up-good' }
		],
		rows: table.rows.map((row, i) => {
			const { saved, other } = growthParts(data, { level: 'year', year: Number(run.labels[i]) });
			return [...row, saved, other];
		})
	};
}

// --- targets, derived from your own spending and the settings you state ---

/** Annualized `measure` over the trailing year of months with data. Exported so a projection preview
    reads the same rates the targets are built from. */
export function trailingAnnual(
	data: DashboardData,
	measure: 'spending' | 'saved' | 'contributions' | 'takehome'
): number {
	const keys = data.meta.month_keys.filter((k) => data.months[k]).slice(-12);
	if (!keys.length) return 0;

	const total = sumBy(keys, (k) => measureValue(data, { level: 'month', monthKey: k }, measure));
	// Scale by months present, not a flat year, so a short ledger isn't flattered.
	return (total / keys.length) * 12;
}

const trailingAnnualSpend = (data: DashboardData) => trailingAnnual(data, 'spending');

/** The rates a plan runs on, each stated or else logged. Payroll contributions are always invested; `residual`
    is the take-home left after spending, which seeds the out-of-pocket control, and `investing` is what a
    projection adds. */
export function plannedRates(
	data: DashboardData,
	a: Assumptions
): { spending: number; investing: number; contributions: number; residual: number } {
	const contributions = trailingAnnual(data, 'contributions');
	const spent = trailingAnnualSpend(data);
	// Floored: a year spent out of savings is not a negative leftover to seed the control from.
	const residual = Math.max(0, trailingAnnual(data, 'takehome') - spent);

	return {
		spending: a.plannedSpending ?? spent,
		// NOT capped at `residual`: money can be moved into the market from anywhere, so planning to invest
		// more than last year's leftover is a legitimate plan rather than an error to clamp away.
		investing: contributions + (a.outOfPocket ?? residual),
		contributions,
		residual
	};
}

/** The buckets a return compounds. Liquid cash is held to be spent, so it is not projected to grow. */
const INVESTED = BUCKETS.filter((b) => b !== 'Liquid');

/** The balance a withdrawal comes out of: the invested buckets, not net worth. Cash held as a runway is
    not funding a retirement, and counting it flattered every figure derived from the FI number. */
export function investedBalance(data: DashboardData): number | null {
	const current = data.networth?.current;
	if (!current) return null;

	return sumBy(INVESTED, (bucket) => current.breakdown[bucket] ?? 0);
}

/** The portfolio that sustains your planned spending at your stated withdrawal rate. */
export function fiNumber(data: DashboardData, a: Assumptions = assumptionsOf(data)): Scalar {
	const annual = plannedRates(data, a).spending;
	const rate = a.swr / 100;

	return scalar(MONEY(data.currency), words('FI number'), rate && annual ? annual / rate : null, {
		note: annual ? live(`${money(annual)}/yr at ${a.swr}%`) : words('no spending logged yet')
	});
}

export function fiProgress(data: DashboardData, a: Assumptions = assumptionsOf(data)): Scalar {
	const target = fiNumber(data, a).value;
	const current = investedBalance(data);

	return scalar(
		PERCENT,
		words('FI progress'),
		target && current !== null ? (current / target) * 100 : null,
		{
			note: target ? live(`of ${money(target)}`) : undefined
		}
	);
}

/** Months your liquid cash would cover if income stopped. */
export function liquidRunway(data: DashboardData): Scalar {
	const liquid = data.networth?.current?.breakdown?.['Liquid'] ?? null;
	const monthly = trailingAnnualSpend(data) / 12;

	return scalar(
		MONTHS,
		words('Liquid runway'),
		monthly && liquid !== null ? liquid / monthly : null,
		{
			note: monthly ? live(`at ${money(monthly)}/mo`) : undefined
		}
	);
}

/** The FI number discounted back over the years remaining: the balance that, left alone, compounds into
    it by the retirement age. Null without a birth year. */
export function coastTarget(
	data: DashboardData,
	a: Assumptions = assumptionsOf(data)
): number | null {
	const years = yearsToRetirement(a);
	const target = fiNumber(data, a).value;
	if (years === null || !target) return null;

	return target / (1 + realRate(a) / 100) ** years;
}

/** Why a figure counted from an age is missing. */
export const NEEDS_BIRTH_YEAR = words('set your birth year in Planning');

export function coastFi(data: DashboardData, a: Assumptions = assumptionsOf(data)): Scalar {
	const unit = PERCENT;
	const years = yearsToRetirement(a);
	const needed = coastTarget(data, a);
	const current = investedBalance(data);

	const label = words('Coast FI');
	if (needed === null || current === null) {
		return scalar(unit, label, null, {
			note: years === null ? NEEDS_BIRTH_YEAR : undefined
		});
	}

	const year = coastYear(data, a);
	return scalar(unit, label, (current / needed) * 100, {
		note: year === null ? words("doesn't reach FI at this rate") : live(`reached FI by ${year}`)
	});
}

/** When today's invested balance, left alone, reaches the FI number. Null where it never does. */
export function coastYear(
	data: DashboardData,
	a: Assumptions = assumptionsOf(data)
): number | null {
	const target = fiNumber(data, a).value;
	const current = investedBalance(data);
	if (!target || current === null) return null;

	const now = new Date().getFullYear();
	if (current >= target) return now;
	const growth = 1 + realRate(a) / 100;
	if (current <= 0 || growth <= 1) return null;
	return now + Math.ceil(Math.log(target / current) / Math.log(growth));
}

// --- rates and risk ---

/** Compound annual growth of the balance, as a percentage. Not a return: contributions are included, so
    it overstates investment performance. Null under half a year of history. */
export function balanceGrowth(data: DashboardData, scope: Scope = { level: 'all' }): Scalar {
	if (scope.level === 'year') {
		const change = move(bounds(data, scope), READING.net_worth).percent;
		return scalar(PERCENT, words('Balance growth'), change, { note: words('this year') });
	}
	const { open: first, close: last } = bounds(data, scope);
	const value = first && last ? cagr(first, last) : null;
	return scalar(PERCENT, words('Balance growth'), value, { note: words('CAGR') });
}

/** Compound yearly growth between two snapshots, in percent; null under half a year apart or where either
    is not positive. */
function cagr(first: NetWorthSnapshot, last: NetWorthSnapshot): number | null {
	if (first.net_worth <= 0 || last.net_worth <= 0) return null;
	const years = (Date.parse(last.date) - Date.parse(first.date)) / (365.25 * 24 * 60 * 60 * 1000);
	return years >= 0.5 ? ((last.net_worth / first.net_worth) ** (1 / years) - 1) * 100 : null;
}

export function topAccountShare(data: DashboardData): Scalar {
	const assets = assetAccounts(data);
	const total = sumBy(assets, (a) => a.value);
	const top = assets.reduce<(typeof assets)[number] | null>(
		(best, a) => (best === null || a.value > best.value ? a : best),
		null
	);

	return scalar(PERCENT, words('Top account'), top && total ? (top.value / total) * 100 : null, {
		note: top ? live(`${top.label} of ${money(total)} assets`) : undefined
	});
}

/** One bullet set, each row reusing the scalar that computes it. Rows with no value are dropped. */
export function netWorthThresholds(
	data: DashboardData,
	a: Assumptions = assumptionsOf(data)
): Bullet {
	const runway = liquidRunway(data);
	const fi = fiProgress(data, a);
	const coast = coastFi(data, a);
	const invested = investedBalance(data);
	const of = (target: number | null) =>
		invested !== null && target
			? { value: invested, target, unit: MONEY(data.currency) }
			: undefined;

	const rows: BulletRow[] = [
		{
			label: 'Cash runway',
			unit: MONTHS,
			value: runway.value,
			target: a.runwayTarget,
			note: runway.note
		},
		{
			label: 'FI number',
			unit: PERCENT,
			value: fi.value,
			target: 100,
			note: fi.note,
			amount: of(fiNumber(data, a).value)
		},
		{
			label: 'Coast FI',
			unit: PERCENT,
			value: coast.value,
			target: 100,
			note: coast.note,
			amount: of(coastTarget(data, a))
		}
	];

	return { kind: 'bullet', rows: rows.filter((r) => r.value !== null) };
}

/** What the scope's closing snapshot holds, split: assets by allocation bucket and what is owed by account.
    A snapshot from before the split was exported owes as one `Liabilities` part. */
export function netWorthParts(
	data: DashboardData,
	scope: Scope
): { assets: Categorical; liabilities: Categorical } {
	const unit = MONEY(data.currency);
	const close = windowOf(data, scope).close;
	const pathOf = new Map((data.networth?.accounts ?? []).map((a) => [a.label, a.account]));
	const owed = close?.owed ?? (close ? { Liabilities: close.liabilities } : {});
	return {
		assets: categorical(
			Object.entries(close?.breakdown ?? {}).map(([category, amount]) => ({ category, amount })),
			unit,
			Infinity
		),
		liabilities: categorical(
			Object.entries(owed).map(([category, amount]) => ({
				category,
				amount,
				colorKey: pathOf.get(category)
			})),
			unit,
			Infinity
		)
	};
}
