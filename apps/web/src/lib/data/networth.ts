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
import { MONEY, MONTHS, PERCENT, YEARS } from './primitives';
import { categorical } from './categorical';
import { series } from './series';
import {
	activeMonthsIn,
	activeMonthsNote,
	measureValue,
	percentDelta,
	trackedYearsNote
} from './metric';
import { type Scope, scopeYear } from './scope';
import { dateShort, money, monthLabel, monthName } from '$lib/utils/format';
import { addMonths, yearOf } from '$lib/utils/period';
import { live, words, type Label } from '$lib/ui/label';

/** The three figures every snapshot carries. */
export type SnapshotField = 'net_worth' | 'assets' | 'liabilities';

/** The name each field is drawn under. Shared, because it is also how the registry colours it: one
    hue per level wherever it appears. */
const FIELD_NAME: Record<SnapshotField, string> = {
	net_worth: 'Net worth',
	assets: 'Assets',
	liabilities: 'Liabilities'
};

/** Allocation buckets in display order (mirrors the backend `BUCKETS`). */
const BUCKETS = ['Liquid', 'Taxable', 'Tax-advantaged'];

/** Years a KPI's yearly underlay looks back over. */
const WINDOW_YEARS = 10;

function snapshots(data: DashboardData): NetWorthSnapshot[] {
	return data.networth?.series ?? [];
}

/** Today's live total, or null before anything is snapshotted. */
function currentNetWorth(data: DashboardData): number | null {
	return data.networth?.current?.net_worth ?? null;
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

/** Asset accounts only — liabilities are held and reported separately. */
function assetAccounts(data: DashboardData) {
	return (data.networth?.accounts ?? []).filter((a) => a.group !== 'liability');
}

/** The snapshots a scope plots, and how their dates read on an axis: a year states the day, since two
    balances can be logged in one month, while a lifetime run only has room for the month. */
function axisOf(
	data: DashboardData,
	year?: number
): { points: NetWorthSnapshot[]; labels: string[] } {
	const points = year == null ? snapshots(data) : forYear(data, year);
	const label = year == null ? monthLabel : dateShort;
	return { points, labels: points.map((p) => label(p.date)) };
}

/** One snapshot field per logged snapshot — lifetime (`year` omitted) or one year's. */
function snapshotSeries(data: DashboardData, field: SnapshotField, year?: number): Series {
	const { points, labels } = axisOf(data, year);
	return series(
		FIELD_NAME[field],
		labels,
		points.map((p) => p[field]),
		MONEY(data.currency)
	);
}

/** For signed decompositions, where the sign is the figure's meaning. */
function bySign(value: number): Tone {
	return value >= 0 ? 'good' : 'bad';
}

/** A current-value scalar; net worth also carries its change since the previous snapshot. */
export function netWorthScalar(data: DashboardData, field: SnapshotField, label: Label): Scalar {
	const unit = MONEY(data.currency);
	const current = data.networth?.current ?? null;
	const value = current ? current[field] : null;

	const s: Scalar = { kind: 'scalar', unit, label, value };

	// `current` may share its date with the last series point; skip it so the delta isn't self-vs-self.
	const points = snapshots(data);
	const last = points[points.length - 1];
	const prev = last && current && last.date === current.date ? points[points.length - 2] : last;
	if (field === 'net_worth' && prev && value != null) {
		const change = value - prev.net_worth;
		s.delta = { value: change, unit, tone: bySign(change), note: 'since last' };
	}

	return s;
}

export function netWorthByMonth(data: DashboardData, year?: number): Series {
	return snapshotSeries(data, 'net_worth', year);
}

/** Net worth and assets over time; the gap between them is what is owed. */
export function netWorthVsAssets(data: DashboardData, year?: number): MultiSeries {
	const unit = MONEY(data.currency);
	const { points, labels } = axisOf(data, year);

	return {
		kind: 'multiseries',
		unit,
		axis: 'time',
		labels,
		series: (['net_worth', 'assets'] as SnapshotField[]).map((field) =>
			series(
				FIELD_NAME[field],
				labels,
				points.map((p) => p[field]),
				unit
			)
		)
	};
}

/**
 * A snapshot field at the close of each logged year, most recent `WINDOW_YEARS` only — past that the
 * recent years are too thin to tell apart in a KPI underlay.
 */
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
export function netWorthLiabilities(data: DashboardData, year?: number): Series {
	return snapshotSeries(data, 'liabilities', year);
}

/** The levels the monthly table reports, each followed by how it moved. */
const TABLE_FIELDS: SnapshotField[] = ['net_worth', 'assets', 'liabilities'];

/** Which way each level reads as good news. Owing more is the one that runs the other way, so its
    change columns shade opposite to the rest. */
const UP_IS_GOOD: Record<SnapshotField, TintDirection> = {
	net_worth: 'up-good',
	assets: 'up-good',
	liabilities: 'up-bad'
};

/** A move as a percentage of where the period opened. Taken off the magnitude, so a negative opening
    balance doesn't flip the sign away from the actual movement. */
function pctOf(delta: number, open: number): number {
	return open ? (delta / Math.abs(open)) * 100 : 0;
}

/** A year's snapshots, each level beside the change since the previous snapshot. Every level gets its
    own pair, since the three do not move together: assets can rise on a month a card was also paid. */
export function netWorthMonthlyTable(data: DashboardData, year: number): Table {
	const unit = MONEY(data.currency);
	const all = snapshots(data);

	const rows = forYear(data, year).map((p) => {
		const i = all.findIndex((q) => q.date === p.date);
		const prev = i > 0 ? all[i - 1] : null;

		return [
			dateShort(p.date),
			...TABLE_FIELDS.flatMap((field) => {
				const delta = prev ? p[field] - prev[field] : 0;
				return [p[field], delta, prev ? pctOf(delta, prev[field]) : 0];
			})
		];
	});

	return {
		kind: 'table',
		columns: [
			{ label: 'Date' },
			// The heading repeats beside each level rather than naming it: which level a change belongs to
			// is said by the column it sits next to. Only the change columns are shaded — a balance has no
			// good or bad direction, only its movement does.
			...TABLE_FIELDS.flatMap((field) => [
				{ label: FIELD_NAME[field], unit },
				{ label: 'Change', unit, tint: UP_IS_GOOD[field] },
				{ label: 'Change %', unit: PERCENT, tint: UP_IS_GOOD[field] }
			])
		],
		rows
	};
}

/**
 * Each level's month-over-month move across a year. A month with two snapshots reports one move, from
 * the previous month's close to its own.
 *
 * `axis` picks which unit the chart plots; the other rides along as the points' alternate reading. The
 * two say the same thing at different scales — the base barely moves month to month, so the dollar and
 * percent shapes are near-identical — which is why they belong in one chart rather than two.
 */
function changeByMonth(
	data: DashboardData,
	year: number,
	fields: SnapshotField[],
	axis: 'value' | 'percent'
): MultiSeries {
	const money = MONEY(data.currency);
	const unit = axis === 'percent' ? PERCENT : money;
	const altUnit = axis === 'percent' ? money : PERCENT;
	const keys = snapshotMonths(data, year);
	const labels = keys.map(monthName);

	/** A month's move in both units at once, so the pair cannot drift apart. Month over month, so the
	    freshest reading counts — see `monthOverMonth`. */
	const move = (monthKey: string, field: SnapshotField): { value: number; percent: number } => {
		const { open, close } = monthOverMonth(data, monthKey);
		if (!open || !close) return { value: 0, percent: 0 };
		const delta = close[field] - open[field];
		return { value: delta, percent: pctOf(delta, open[field]) };
	};

	return {
		kind: 'multiseries',
		unit,
		axis: 'ordinal',
		labels,
		series: fields.map((field) => {
			const moves = keys.map((k) => move(k, field));
			const read = (m: (typeof moves)[number]) => (axis === 'percent' ? m.percent : m.value);
			const other = (m: (typeof moves)[number]) => (axis === 'percent' ? m.value : m.percent);
			return series(FIELD_NAME[field], labels, moves.map(read), unit, 'ordinal', {
				unit: altUnit,
				values: moves.map(other)
			});
		})
	};
}

/**
 * The two levels that can share one chart. Liabilities are excluded and drawn on their own: they move by
 * hundreds of dollars, invisible beside tens of thousands, and by hundreds of percent, which flattens
 * everything else to a hairline at zero.
 */
const PAIRED_FIELDS: SnapshotField[] = ['net_worth', 'assets'];

/** How much each month added, as a percentage of where it opened, with the dollars alongside. */
export function netWorthAssetsChange(data: DashboardData, year: number): MultiSeries {
	return changeByMonth(data, year, PAIRED_FIELDS, 'percent');
}

/**
 * The same two levels a year at a time: whether growth is speeding up or slowing as the base gets
 * bigger, which the dollar decomposition beside it cannot say.
 */
function changeByYear(data: DashboardData, fields: SnapshotField[]): MultiSeries {
	const years = snapshotYears(data);
	const money = MONEY(data.currency);
	const labels = years.map(String);

	const move = (year: number, field: SnapshotField) => {
		const { open, close } = bounds(data, { level: 'year', year });
		if (!open || !close) return { value: 0, percent: 0 };
		const delta = close[field] - open[field];
		return { value: delta, percent: pctOf(delta, open[field]) };
	};

	return {
		kind: 'multiseries',
		unit: PERCENT,
		axis: 'ordinal',
		labels,
		series: fields.map((field) => {
			const moves = years.map((y) => move(y, field));
			return series(
				FIELD_NAME[field],
				labels,
				moves.map((m) => m.percent),
				PERCENT,
				'ordinal',
				{
					unit: money,
					values: moves.map((m) => m.value)
				}
			);
		})
	};
}

export function netWorthAssetsChangeByYear(data: DashboardData): MultiSeries {
	return changeByYear(data, PAIRED_FIELDS);
}

/** What is owed, year over year, on an axis of its own. */
export function liabilitiesChangeByYear(data: DashboardData): MultiSeries {
	return changeByYear(data, ['liabilities']);
}

/** What is owed, month over month, on the same percentage axis as the pair above. */
export function liabilitiesChange(data: DashboardData, year: number): MultiSeries {
	return changeByMonth(data, year, ['liabilities'], 'percent');
}

/** Net worth's percent move per logged year — the shape behind the compound-growth card. Named for the
    rate rather than the balance, so the registry gives it its own hue instead of net worth's. */
export function growthRateByYear(data: DashboardData): Series {
	const years = snapshotYears(data);

	return series(
		'Balance growth',
		years.map(String),
		years.map((year) => {
			const { open, close } = bounds(data, { level: 'year', year });
			return open && close ? pctOf(close.net_worth - open.net_worth, open.net_worth) : 0;
		}),
		PERCENT,
		'ordinal'
	);
}

/**
 * One band per allocation bucket over time, `of` deciding whether a band's thickness is a share of assets
 * or the balance itself. Whichever it is not rides along as the points' alternate reading: a band answers
 * "how much" and "what fraction" at once, where the chart's axis can only state one.
 */
function allocation(data: DashboardData, of: 'share' | 'value', year?: number): MultiSeries {
	const money = MONEY(data.currency);
	const unit = of === 'share' ? PERCENT : money;
	const altUnit = of === 'share' ? money : PERCENT;
	const { points, labels } = axisOf(data, year);

	const held = (p: NetWorthSnapshot, b: string) => p.breakdown[b] ?? 0;
	const share = (p: NetWorthSnapshot, b: string) => (p.assets ? (held(p, b) / p.assets) * 100 : 0);
	const read = of === 'share' ? share : held;
	const other = of === 'share' ? held : share;

	return {
		kind: 'multiseries',
		unit,
		axis: 'time',
		labels,
		series: BUCKETS.map((b) =>
			series(
				b,
				labels,
				points.map((p) => read(p, b)),
				unit,
				'time',
				{ unit: altUnit, values: points.map((p) => other(p, b)) }
			)
		)
	};
}

/** Each bucket's share of assets over time. */
export function netWorthAllocationShare(data: DashboardData, year?: number): MultiSeries {
	return allocation(data, 'share', year);
}

/** Each bucket's balance over time. The share view normalizes every column to 100%, so only this one
    says whether a band thinned because it shrank or because another grew. */
export function netWorthAllocationValue(data: DashboardData, year?: number): MultiSeries {
	return allocation(data, 'value', year);
}

/**
 * Every asset account by value, largest first. Liabilities excluded: a negative bar has no share.
 *
 * Labelled by display name but coloured by ledger path, which is what the account colour map is keyed
 * by — labelling and colouring by the same string left every bar on the fallback hue.
 */
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
//     ΔNetWorth = saved + everything-else,  saved = logged income − logged spending
//
// The remainder stays one term: an investment snapshot's pad absorbs both market growth and unlogged
// flow, so splitting them would be a guess.

/** The half-open span of dates a scope covers: `[start, next)`. */
function span(data: DashboardData, scope: Scope): { start: string; next: string } {
	if (scope.level === 'month') {
		const key = scope.monthKey ?? '';
		return { start: `${key}-01`, next: `${addMonths(key, 1)}-01` };
	}

	const year = scopeYear(data, scope);
	return { start: `${year}-01-01`, next: `${year + 1}-01-01` };
}

/**
 * The snapshots bounding a scope: the balance it opened at, and the balance it closed at.
 *
 * A balance is logged BEFORE the period's money has moved — a snapshot dated the 1st is taken before
 * that month's first paycheck lands. So it is the period's OPENING balance, and the period closes on the
 * snapshot dated the start of the next one. Reading the last snapshot dated *inside* the period as its
 * close instead put every period's balance movement against the following period's logged saving, so the
 * decomposition subtracted two different months from each other.
 */
function bounds(
	data: DashboardData,
	scope: Scope
): { open: NetWorthSnapshot | null; close: NetWorthSnapshot | null } {
	const all = snapshots(data);
	if (scope.level === 'all') {
		return { open: all[0] ?? null, close: all[all.length - 1] ?? null };
	}

	const { start, next } = span(data, scope);
	const upTo = (date: string) => all.filter((p) => p.date <= date).at(-1) ?? null;
	// A period that begins before anything was logged opens at its own first snapshot instead, so the
	// first tracked year still reports a move rather than nothing.
	const inside = all.filter((p) => p.date > start && p.date <= next);

	return { open: upTo(start) ?? inside[0] ?? null, close: upTo(next) };
}

/** The change in net worth over a scope, or 0 when it can't be bounded. */
function changeOver(data: DashboardData, scope: Scope): number {
	const { open, close } = bounds(data, scope);
	return open && close ? close.net_worth - open.net_worth : 0;
}

/**
 * The snapshots a month-over-month bar spans: the freshest reading in the month before, to the freshest in
 * the month itself.
 *
 * Deliberately not `bounds`. This takes the NEWEST balance available rather than the one dated at the
 * period's edge, so a mid-month reading counts — the point of the bars. The cost is that the window
 * drifts: a month whose only snapshot is dated the 1st reports the month before's movement, and the bars
 * therefore do not sum to the year figures, which use `bounds`.
 */
function monthOverMonth(data: DashboardData, monthKey: string) {
	const all = snapshots(data);
	const latestIn = (key: string) => all.filter((p) => p.date.startsWith(key)).at(-1) ?? null;
	// Falls back to the last snapshot before this month where the one before it has none, so a gap in
	// logging shortens the bar rather than dropping it.
	const before = all.filter((p) => p.date < `${monthKey}-01`).at(-1) ?? null;

	return { open: latestIn(addMonths(monthKey, -1)) ?? before, close: latestIn(monthKey) };
}

/**
 * Logged saving across a snapshot window: every tracked month whose 1st falls in `[open, close)`. A
 * snapshot dated the 1st is taken before that month's money moves, so the month the window opens on counts
 * and the month it closes on does not — a window of Jul 1 → Aug 26 is July's saving plus August's.
 */
function savedBetween(data: DashboardData, open: string, close: string): number {
	return data.meta.month_keys
		.filter((key) => `${key}-01` >= open && `${key}-01` < close)
		.reduce((sum, monthKey) => sum + measureValue(data, { level: 'month', monthKey }, 'saved'), 0);
}

/** A month-over-month bar's decomposition, over the window `monthOverMonth` spans. */
function momParts(data: DashboardData, monthKey: string): Record<GrowthPart, number> {
	const { open, close } = monthOverMonth(data, monthKey);
	if (!open || !close) return { change: 0, saved: 0, other: 0 };

	const change = close.net_worth - open.net_worth;
	const saved = savedBetween(data, open.date, close.date);
	return { change, saved, other: change - saved };
}

/**
 * How a period's growth is read: the whole move, and the two parts that sum to it. `change` is the
 * growth itself rather than a part of it, which is why the type is named for the parts of a whole.
 */
export type GrowthPart = 'change' | 'saved' | 'other';

/** A scope's growth, split. One source of truth, so a card, a bar and a matrix cell describing the same
    part cannot disagree. */
function growthParts(data: DashboardData, scope: Scope): Record<GrowthPart, number> {
	const change = changeOver(data, scope);
	const saved = measureValue(data, scope, 'saved');
	return { change, saved, other: change - saved };
}

/** A decomposition term's share of the period's change, as its note. */
function shareNote(part: number, change: number, fallback: string): Label {
	return change ? live(`${Math.round((part / change) * 100)}% of the change`) : words(fallback);
}

/** Net worth at the end of a scope, with its change over that scope as a delta. */
export function netWorthChange(data: DashboardData, scope: Scope): Scalar {
	const unit = MONEY(data.currency);
	const { open, close } = bounds(data, scope);
	const value = close?.net_worth ?? null;
	const s: Scalar = { kind: 'scalar', unit, label: words('Net worth'), value };

	if (open && close && open !== close) {
		const delta = close.net_worth - open.net_worth;
		s.delta = {
			value: delta,
			unit,
			tone: bySign(delta),
			note: scope.level === 'all' ? 'since first snapshot' : 'this year'
		};
	}

	return s;
}

/** How much of the scope's change in net worth came from logged saving. */
export function netWorthSaved(data: DashboardData, scope: Scope): Scalar {
	const { change, saved } = growthParts(data, scope);

	return {
		kind: 'scalar',
		unit: MONEY(data.currency),
		label: words('Saved'),
		value: saved,
		tone: bySign(saved),
		note: shareNote(saved, change, 'income − spending')
	};
}

/** The rest of the scope's change: market movement plus anything that wasn't logged. */
export function netWorthOther(data: DashboardData, scope: Scope): Scalar {
	const { open, close } = bounds(data, scope);
	if (!open || !close) {
		return {
			kind: 'scalar',
			unit: MONEY(data.currency),
			label: words('Market & other'),
			value: null
		};
	}

	const { change, other } = growthParts(data, scope);

	return {
		kind: 'scalar',
		unit: MONEY(data.currency),
		label: words('Market & other'),
		value: other,
		tone: bySign(other),
		note: shareNote(other, change, 'growth + unlogged flow')
	};
}

/** The two terms over a run of periods, named the way the registry colours them. `parts` is how each
    period is decomposed, which differs between the yearly and the month-over-month readings. */
function growthSeries(
	data: DashboardData,
	labels: string[],
	parts: Record<GrowthPart, number>[]
): MultiSeries {
	const unit = MONEY(data.currency);
	const read = (part: GrowthPart) => parts.map((p) => p[part]);

	return {
		kind: 'multiseries',
		unit,
		axis: 'ordinal',
		labels,
		series: [
			series('Saved', labels, read('saved'), unit),
			series('Market & other', labels, read('other'), unit)
		]
	};
}

/** Saved vs everything-else per year. */
export function savedVsOther(data: DashboardData): MultiSeries {
	const years = snapshotYears(data);
	return growthSeries(
		data,
		years.map(String),
		years.map((year) => growthParts(data, { level: 'year', year }))
	);
}

/** Saved vs everything-else per month of one year: which months were yours and which were the market's,
    where the yearly view can only say who won the year. Month over month — see `monthOverMonth`. */
export function savedVsOtherByMonth(data: DashboardData, year: number): MultiSeries {
	const keys = snapshotMonths(data, year);
	return growthSeries(
		data,
		keys.map(monthName),
		keys.map((monthKey) => momParts(data, monthKey))
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

/** The decomposition as a matrix column reads it: the level, and at year scope how it moved against last
    year's own. Lifetime carries no badge — there is no prior lifetime to compare it with. */
export function netWorthGrowth(
	data: DashboardData,
	scope: Scope,
	part: GrowthPart,
	label: Label
): Scalar {
	const now = growthParts(data, scope)[part];
	const s: Scalar = { kind: 'scalar', unit: MONEY(data.currency), label, value: now };

	if (scope.level === 'year') {
		const before = growthParts(data, { level: 'year', year: scopeYear(data, scope) - 1 })[part];
		s.delta = percentDelta(now, before, bySign(now - before), 'YoY');
	}

	return s;
}

/** A growth part averaged over the years it spanned — the lifetime matrix's per-year row. */
export function netWorthGrowthPerYear(data: DashboardData, part: GrowthPart, label: Label): Scalar {
	const years = snapshotYears(data).length || 1;

	return {
		kind: 'scalar',
		unit: MONEY(data.currency),
		label,
		value: growthParts(data, { level: 'all' })[part] / years,
		note: trackedYearsNote(years)
	};
}

/** The same term as a monthly run-rate. At year scope it is judged rate against rate, so a
    part-finished year is not read as a collapse. */
export function netWorthGrowthPerMonth(
	data: DashboardData,
	scope: Scope,
	part: GrowthPart,
	label: Label
): Scalar {
	// Resolved per scope rather than read off `scope.year`, which a year scope may leave for the default.
	const months = (s: Scope) =>
		activeMonthsIn(data, s.level === 'year' ? scopeYear(data, s) : undefined) || 1;
	const rate = (s: Scope) => growthParts(data, s)[part] / months(s);

	const now = rate(scope);
	const out: Scalar = {
		kind: 'scalar',
		unit: MONEY(data.currency),
		label,
		value: now,
		note: activeMonthsNote(months(scope))
	};

	if (scope.level === 'year') {
		const before = rate({ level: 'year', year: scopeYear(data, scope) - 1 });
		out.delta = percentDelta(now, before, bySign(now - before), 'YoY');
	}

	return out;
}

// --- where the money landed, period by period ---
//
// The same shape as the snapshot tables above: a level, its move, and that move as a share of what the
// bucket opened at. Read as a table rather than bars, since the question is how many dollars a type
// added and what fraction of itself that was — two figures a shape can only imply.

/** A bucket's balance in a snapshot, or 0 when it held none. */
const heldIn = (p: NetWorthSnapshot | null, bucket: string) => p?.breakdown[bucket] ?? 0;

/** Every bucket's level, move and percentage for one period. */
function bucketCells(open: NetWorthSnapshot | null, close: NetWorthSnapshot | null): number[] {
	return BUCKETS.flatMap((bucket) => {
		const level = heldIn(close, bucket);
		const delta = open && close ? level - heldIn(open, bucket) : 0;
		return [level, delta, open ? pctOf(delta, heldIn(open, bucket)) : 0];
	});
}

/** More of any asset type is good news, so every bucket's change columns shade the same way. */
function bucketColumns(unit: Unit, period: string): TableColumn[] {
	return [
		{ label: period },
		...BUCKETS.flatMap((bucket) => [
			{ label: bucket, unit },
			{ label: 'Change', unit, tint: 'up-good' as TintDirection },
			{ label: 'Change %', unit: PERCENT, tint: 'up-good' as TintDirection }
		])
	];
}

/**
 * How much each allocation bucket added over a run of periods. Dollars on the axis: the three buckets are
 * parts of one total, so their moves are directly comparable — which is the whole question — where a
 * percentage would make the smallest bucket's swings the loudest. The percentage rides along on hover.
 */
/** `windows` is a period's opening and closing snapshot, so the yearly and month-over-month readings can
    each supply their own pairing. */
function bucketChange(
	data: DashboardData,
	labels: string[],
	windows: { open: NetWorthSnapshot | null; close: NetWorthSnapshot | null }[]
): MultiSeries {
	const unit = MONEY(data.currency);

	return {
		kind: 'multiseries',
		unit,
		axis: 'ordinal',
		labels,
		series: BUCKETS.map((bucket) => {
			const moves = windows.map(({ open, close }) => {
				if (!close) return { value: 0, percent: 0 };
				const delta = heldIn(close, bucket) - heldIn(open, bucket);
				return { value: delta, percent: pctOf(delta, heldIn(open, bucket)) };
			});
			return series(
				bucket,
				labels,
				moves.map((m) => m.value),
				unit,
				'ordinal',
				{ unit: PERCENT, values: moves.map((m) => m.percent) }
			);
		})
	};
}

/** Each bucket's move per month of one year, month over month — see `monthOverMonth`. */
export function bucketChangeByMonth(data: DashboardData, year: number): MultiSeries {
	const keys = snapshotMonths(data, year);
	return bucketChange(
		data,
		keys.map(monthName),
		keys.map((monthKey) => monthOverMonth(data, monthKey))
	);
}

/** Each bucket's move per logged year. */
export function bucketChangeByYear(data: DashboardData): MultiSeries {
	const years = snapshotYears(data);
	return bucketChange(
		data,
		years.map(String),
		years.map((year) => bounds(data, { level: 'year', year }))
	);
}

/** Each bucket per snapshot of one year, measured against the snapshot before it. */
export function bucketMonthlyTable(data: DashboardData, year: number): Table {
	const all = snapshots(data);

	const rows = forYear(data, year).map((p) => {
		const i = all.findIndex((q) => q.date === p.date);
		return [dateShort(p.date), ...bucketCells(i > 0 ? all[i - 1]! : null, p)];
	});

	return { kind: 'table', columns: bucketColumns(MONEY(data.currency), 'Date'), rows };
}

/** Each bucket per logged year, measured against the balance the year opened from. */
export function bucketYearTable(data: DashboardData): Table {
	const rows = snapshotYears(data)
		.reverse()
		.map((year) => {
			const { open, close } = bounds(data, { level: 'year', year });
			return [String(year), ...bucketCells(open, close)];
		});

	return { kind: 'table', columns: bucketColumns(MONEY(data.currency), 'Year'), rows };
}

/**
 * Every year: each level with how it moved, then the change split into what you saved and what you
 * didn't. The same shape as the monthly table, plus the decomposition only a whole year can carry.
 */
export function netWorthYearTable(data: DashboardData): Table {
	const unit = MONEY(data.currency);
	const years = snapshotYears(data).reverse();

	const rows = years.map((year) => {
		const scope: Scope = { level: 'year', year };
		const { open, close } = bounds(data, scope);
		const { saved, other } = growthParts(data, scope);

		return [
			String(year),
			...TABLE_FIELDS.flatMap((field) => {
				const level = close?.[field] ?? 0;
				const delta = open && close ? close[field] - open[field] : 0;
				return [level, delta, open ? pctOf(delta, open[field]) : 0];
			}),
			saved,
			other
		];
	});

	return {
		kind: 'table',
		columns: [
			{ label: 'Year' },
			...TABLE_FIELDS.flatMap((field) => [
				{ label: FIELD_NAME[field], unit },
				{ label: 'Change', unit, tint: UP_IS_GOOD[field] },
				{ label: 'Change %', unit: PERCENT, tint: UP_IS_GOOD[field] }
			]),
			// These two add to the net-worth Change column above, which is why they carry no percentage of
			// their own: a share of the change is what the pane above the table is for.
			{ label: 'Saved', unit, tint: 'up-good' },
			{ label: 'Market & other', unit, tint: 'up-good' }
		],
		rows
	};
}

// --- targets, derived from your own spending and the settings you state ---

/** Annualized `measure` over the trailing year of months with data. Exported for the projection, which
    needs the same two rates the targets are built from so a preview cannot disagree with them. */
export function trailingAnnual(data: DashboardData, measure: 'spending' | 'saved'): number {
	const keys = data.meta.month_keys.filter((k) => data.months[k]).slice(-12);
	if (!keys.length) return 0;

	const total = keys.reduce(
		(sum, k) => sum + measureValue(data, { level: 'month', monthKey: k }, measure),
		0
	);
	// Scale by months present, not a flat year, so a short ledger isn't flattered.
	return (total / keys.length) * 12;
}

const trailingAnnualSpend = (data: DashboardData) => trailingAnnual(data, 'spending');

const swrOf = (data: DashboardData) => data.settings?.swr ?? 4;

/** The portfolio that sustains your current spending at your stated withdrawal rate. */
export function fiNumber(data: DashboardData): Scalar {
	const annual = trailingAnnualSpend(data);
	const rate = swrOf(data) / 100;

	return {
		kind: 'scalar',
		unit: MONEY(data.currency),
		label: words('FI number'),
		value: rate && annual ? annual / rate : null,
		note: annual ? live(`${money(annual)}/yr at ${swrOf(data)}%`) : words('no spending logged yet')
	};
}

export function fiProgress(data: DashboardData): Scalar {
	const target = fiNumber(data).value;
	const current = currentNetWorth(data);

	return {
		kind: 'scalar',
		unit: PERCENT,
		label: words('FI progress'),
		value: target && current !== null ? (current / target) * 100 : null,
		note: target ? live(`of ${money(target)}`) : undefined
	};
}

/** Years until the retirement age you stated, or null without a birth year to count from. */
function yearsToRetirement(data: DashboardData): number | null {
	const birthYear = data.settings?.birth_year ?? null;
	if (birthYear === null) return null;

	const age = new Date().getFullYear() - birthYear;
	return Math.max(0, (data.settings?.retire_age ?? 60) - age);
}

/**
 * Years your net worth would cover at your current spending, measured against the years left until
 * retirement — whether the balance could already carry you there.
 *
 * Not measured against the years a portfolio at the FI number would cover: that is `1 / swr`, so the
 * ratio would come out identical to `fiProgress` and state the same thing in a second unit.
 */
export function yearsOfFreedom(data: DashboardData): Scalar {
	const annual = trailingAnnualSpend(data);
	const current = currentNetWorth(data);
	const runway = yearsToRetirement(data);

	return {
		kind: 'scalar',
		unit: YEARS,
		label: words('Years of freedom'),
		value: annual && current !== null ? current / annual : null,
		target: runway ?? undefined,
		note: annual ? live(`at ${money(annual)}/yr`) : undefined
	};
}

/** Months your liquid cash would cover if income stopped. */
export function liquidRunway(data: DashboardData): Scalar {
	const liquid = data.networth?.current?.breakdown?.['Liquid'] ?? null;
	const monthly = trailingAnnualSpend(data) / 12;

	return {
		kind: 'scalar',
		unit: MONTHS,
		label: words('Liquid runway'),
		value: monthly && liquid !== null ? liquid / monthly : null,
		note: monthly ? live(`at ${money(monthly)}/mo`) : undefined
	};
}

/**
 * Progress to "coast" — the balance that, left alone, compounds into your FI number by your target
 * age. Null without a birth year, which is the only source of how long you have.
 */
export function coastFi(data: DashboardData): Scalar {
	const unit = PERCENT;
	const years = yearsToRetirement(data);
	const target = fiNumber(data).value;
	const current = currentNetWorth(data);

	if (years === null || !target || current === null) {
		return {
			kind: 'scalar',
			unit,
			label: words('Coast FI'),
			value: null,
			note: years === null ? words('set your birth year in Manage') : undefined
		};
	}

	const growth = (1 + (data.settings?.real_return ?? 5) / 100) ** years;
	const needed = target / growth;

	return {
		kind: 'scalar',
		unit,
		label: words('Coast FI'),
		value: (current / needed) * 100,
		note: live(`${money(needed)} needed ${years} yr out`)
	};
}

// --- rates and risk ---

/**
 * Compound annual growth of the balance, as a percentage. Not a return: contributions are included, so
 * it overstates investment performance. Null under half a year of history.
 */
export function balanceGrowth(data: DashboardData): Scalar {
	const all = snapshots(data);
	const first = all[0];
	const last = all[all.length - 1];

	let value: number | null = null;
	if (first && last && first.net_worth > 0 && last.net_worth > 0) {
		const years = (Date.parse(last.date) - Date.parse(first.date)) / (365.25 * 24 * 60 * 60 * 1000);
		if (years >= 0.5) value = ((last.net_worth / first.net_worth) ** (1 / years) - 1) * 100;
	}

	return {
		kind: 'scalar',
		unit: PERCENT,
		label: words('Balance growth'),
		value,
		note: words('CAGR')
	};
}

/** The largest single account as a share of assets. */
export function topAccountShare(data: DashboardData): Scalar {
	const assets = assetAccounts(data);
	const total = assets.reduce((sum, a) => sum + a.value, 0);
	const top = assets.reduce<(typeof assets)[number] | null>(
		(best, a) => (best === null || a.value > best.value ? a : best),
		null
	);

	return {
		kind: 'scalar',
		unit: PERCENT,
		label: words('Top account'),
		value: top && total ? (top.value / total) * 100 : null,
		note: top ? live(`${top.label} of ${money(total)} assets`) : undefined
	};
}

/**
 * Cash runway, the FI number and Coast FI as one bullet set, each reusing the scalar that computes it.
 * Rows with no value are dropped rather than drawn empty.
 */
export function netWorthThresholds(data: DashboardData): Bullet {
	const runway = liquidRunway(data);
	const fi = fiProgress(data);
	const coast = coastFi(data);
	const target = data.settings?.runway_target ?? 6;

	const rows: BulletRow[] = [
		{ label: 'Cash runway', unit: MONTHS, value: runway.value, target, note: runway.note },
		{ label: 'FI number', unit: PERCENT, value: fi.value, target: 100, note: fi.note },
		{ label: 'Coast FI', unit: PERCENT, value: coast.value, target: 100, note: coast.note }
	];

	return { kind: 'bullet', rows: rows.filter((r) => r.value !== null) };
}
