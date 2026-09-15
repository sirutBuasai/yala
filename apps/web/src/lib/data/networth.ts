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
	TintDirection,
	Tone
} from './primitives';
import { MONEY, MONTHS, PERCENT, YEARS } from './primitives';
import { categorical } from './categorical';
import { series } from './series';
import { activeMonthsIn, activeMonthsNote, measureValue, percentDelta } from './metric';
import { type Scope, scopeYear } from './scope';
import { dateShort, money, monthLabel, monthName } from '$lib/utils/format';
import { yearOf } from '$lib/utils/period';
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
export function netWorthVsAssets(data: DashboardData): MultiSeries {
	const unit = MONEY(data.currency);
	const { points, labels } = axisOf(data);

	return {
		kind: 'multiseries',
		unit,
		axis: 'time',
		labels,
		series: (['net_worth', 'assets'] as SnapshotField[]).map((f) =>
			series(
				FIELD_NAME[f],
				labels,
				points.map((p) => p[f]),
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
			...TABLE_FIELDS.flatMap((f) => {
				const delta = prev ? p[f] - prev[f] : 0;
				return [p[f], delta, prev ? pctOf(delta, prev[f]) : 0];
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
			...TABLE_FIELDS.flatMap((f) => [
				{ label: FIELD_NAME[f], unit },
				{ label: 'Change', unit, tint: UP_IS_GOOD[f] },
				{ label: 'Change %', unit: PERCENT, tint: UP_IS_GOOD[f] }
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

	/** A month's move in both units at once, so the pair cannot drift apart. */
	const move = (monthKey: string, field: SnapshotField): { value: number; percent: number } => {
		const { open, close } = bounds(data, { level: 'month', monthKey });
		if (!open || !close) return { value: 0, percent: 0 };
		const delta = close[field] - open[field];
		return { value: delta, percent: pctOf(delta, open[field]) };
	};

	return {
		kind: 'multiseries',
		unit,
		axis: 'ordinal',
		labels,
		series: fields.map((f) => {
			const moves = keys.map((k) => move(k, f));
			const read = (m: (typeof moves)[number]) => (axis === 'percent' ? m.percent : m.value);
			const other = (m: (typeof moves)[number]) => (axis === 'percent' ? m.value : m.percent);
			return series(FIELD_NAME[f], labels, moves.map(read), unit, 'ordinal', {
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

/** What is owed, month over month, on the same percentage axis as the pair above. */
export function liabilitiesChange(data: DashboardData, year: number): MultiSeries {
	return changeByMonth(data, year, ['liabilities'], 'percent');
}

/** One band per allocation bucket over time, `of` deciding whether a band's thickness is a share of
    assets or the balance itself. */
function allocation(data: DashboardData, of: 'share' | 'value', year?: number): MultiSeries {
	const unit = of === 'share' ? PERCENT : MONEY(data.currency);
	const { points, labels } = axisOf(data, year);
	const read = (p: NetWorthSnapshot, b: string) => {
		const held = p.breakdown[b] ?? 0;
		if (of === 'value') return held;
		return p.assets ? (held / p.assets) * 100 : 0;
	};

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
				unit
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

/** Every asset account by value, largest first. Liabilities excluded: a negative bar has no share. */
export function netWorthAccounts(data: DashboardData): Categorical {
	return categorical(
		assetAccounts(data).map((a) => ({ category: a.label, amount: a.value })),
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

/** The ISO date prefix a scope's snapshots start with. */
function datePrefix(data: DashboardData, scope: Scope): string {
	return scope.level === 'month' ? (scope.monthKey ?? '') : `${scopeYear(data, scope)}-`;
}

/** The snapshots bounding a scope: the balance it started from, and the last one within it. */
function bounds(
	data: DashboardData,
	scope: Scope
): { open: NetWorthSnapshot | null; close: NetWorthSnapshot | null } {
	const all = snapshots(data);
	if (scope.level === 'all') {
		return { open: all[0] ?? null, close: all[all.length - 1] ?? null };
	}

	const prefix = datePrefix(data, scope);
	const within = all.filter((p) => p.date.startsWith(prefix));
	const before = all.filter((p) => p.date < prefix);
	return {
		// A period opens at the last snapshot before it — the balance the period started from.
		open: before[before.length - 1] ?? within[0] ?? null,
		close: within[within.length - 1] ?? null
	};
}

/** The change in net worth over a scope, or 0 when it can't be bounded. */
function changeOver(data: DashboardData, scope: Scope): number {
	const { open, close } = bounds(data, scope);
	return open && close ? close.net_worth - open.net_worth : 0;
}

/** The three figures the decomposition reads: the move, and the two terms that sum to it. */
export type Force = 'change' | 'saved' | 'other';

/** The decomposition over a scope. One source of truth, so a card, a bar and a matrix cell describing
    the same term cannot disagree. */
function forces(data: DashboardData, scope: Scope): Record<Force, number> {
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
	const { change, saved } = forces(data, scope);

	return {
		kind: 'scalar',
		unit: MONEY(data.currency),
		label: words('You saved'),
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

	const { change, other } = forces(data, scope);

	return {
		kind: 'scalar',
		unit: MONEY(data.currency),
		label: words('Market & other'),
		value: other,
		tone: bySign(other),
		note: shareNote(other, change, 'growth + unlogged flow')
	};
}

/** The two terms over a run of periods, named the way the registry colours them. */
function forceSeries(data: DashboardData, labels: string[], scopes: Scope[]): MultiSeries {
	const unit = MONEY(data.currency);
	const read = (f: Force) => scopes.map((s) => forces(data, s)[f]);

	return {
		kind: 'multiseries',
		unit,
		axis: 'ordinal',
		labels,
		series: [
			series('You saved', labels, read('saved'), unit),
			series('Market & other', labels, read('other'), unit)
		]
	};
}

/** Saved vs everything-else per year. */
export function savedVsOther(data: DashboardData): MultiSeries {
	const years = snapshotYears(data);
	return forceSeries(
		data,
		years.map(String),
		years.map((year) => ({ level: 'year', year }))
	);
}

/** Saved vs everything-else per month of one year: which months were yours and which were the
    market's, where the yearly view can only say who won the year. */
export function savedVsOtherByMonth(data: DashboardData, year: number): MultiSeries {
	const keys = snapshotMonths(data, year);
	return forceSeries(
		data,
		keys.map(monthName),
		keys.map((monthKey) => ({ level: 'month', monthKey }))
	);
}

/** One term per month of a year, for the mark behind a KPI card. */
export function forceByMonth(data: DashboardData, year: number, f: Force, name: string): Series {
	const keys = snapshotMonths(data, year);
	return series(
		name,
		keys.map(monthName),
		keys.map((monthKey) => forces(data, { level: 'month', monthKey })[f]),
		MONEY(data.currency),
		'ordinal'
	);
}

/** The year's decomposition as a matrix column reads it: the level, against last year's own. */
export function netWorthForce(data: DashboardData, scope: Scope, f: Force, label: Label): Scalar {
	const year = scopeYear(data, scope);
	const now = forces(data, scope)[f];
	const before = forces(data, { level: 'year', year: year - 1 })[f];

	return {
		kind: 'scalar',
		unit: MONEY(data.currency),
		label,
		value: now,
		delta: percentDelta(now, before, bySign(now - before), 'YoY')
	};
}

/** The same term as a monthly run-rate. Rate against rate, so a part-finished year is not read as a
    collapse. */
export function netWorthForceRate(
	data: DashboardData,
	scope: Scope,
	f: Force,
	label: Label
): Scalar {
	const year = scopeYear(data, scope);
	const rate = (y: number) =>
		forces(data, { level: 'year', year: y })[f] / (activeMonthsIn(data, y) || 1);
	const now = rate(year);

	return {
		kind: 'scalar',
		unit: MONEY(data.currency),
		label,
		value: now,
		delta: percentDelta(now, rate(year - 1), bySign(now - rate(year - 1)), 'YoY'),
		note: activeMonthsNote(activeMonthsIn(data, year))
	};
}

/** Every year's change, split into what you saved and what you didn't. */
export function netWorthYearTable(data: DashboardData): Table {
	const unit = MONEY(data.currency);
	const years = snapshotYears(data).reverse();

	const rows = years.map((year) => {
		const scope: Scope = { level: 'year', year };
		const { open, close } = bounds(data, scope);
		const change = changeOver(data, scope);
		const saved = measureValue(data, scope, 'saved');
		const pct = open && open.net_worth ? (change / open.net_worth) * 100 : 0;
		return [String(year), close?.net_worth ?? 0, change, pct, saved, change - saved];
	});

	return {
		kind: 'table',
		columns: [
			{ label: 'Year' },
			{ label: 'Net worth', unit },
			{ label: 'Change', unit },
			{ label: 'Change %', unit: PERCENT },
			{ label: 'You saved', unit },
			{ label: 'Market & other', unit }
		],
		rows
	};
}

// --- targets, derived from your own spending and the settings you state ---

/** Annualized spending over the trailing year of months with data. */
function trailingAnnualSpend(data: DashboardData): number {
	const keys = data.meta.month_keys.filter((k) => data.months[k]).slice(-12);
	if (!keys.length) return 0;

	const total = keys.reduce(
		(sum, k) => sum + measureValue(data, { level: 'month', monthKey: k }, 'spending'),
		0
	);
	// Scale by months present, not a flat year, so a short ledger isn't flattered.
	return (total / keys.length) * 12;
}

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

/** Years your net worth would cover at your current spending. */
export function yearsOfFreedom(data: DashboardData): Scalar {
	const annual = trailingAnnualSpend(data);
	const current = currentNetWorth(data);

	return {
		kind: 'scalar',
		unit: YEARS,
		label: words('Years of freedom'),
		value: annual && current !== null ? current / annual : null,
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
	const birthYear = data.settings?.birth_year ?? null;
	const target = fiNumber(data).value;
	const current = currentNetWorth(data);

	if (birthYear === null || !target || current === null) {
		return {
			kind: 'scalar',
			unit,
			label: words('Coast FI'),
			value: null,
			note: birthYear === null ? words('set your birth year in Manage') : undefined
		};
	}

	const age = new Date().getFullYear() - birthYear;
	const years = Math.max(0, (data.settings?.retire_age ?? 60) - age);
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
		note: words('per year including contributions')
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
		{
			label: 'Cash runway',
			unit: MONTHS,
			value: runway.value,
			target,
			// Relative to the target, so changing the setting moves the shading with it.
			bands: [target / 2, target],
			note: runway.note
		},
		{
			label: 'FI number',
			unit: PERCENT,
			value: fi.value,
			target: 100,
			bands: [25, 50, 100],
			note: fi.note
		},
		{
			label: 'Coast FI',
			unit: PERCENT,
			value: coast.value,
			target: 100,
			bands: [50, 100],
			note: coast.note
		}
	];

	return { kind: 'bullet', rows: rows.filter((r) => r.value !== null) };
}
