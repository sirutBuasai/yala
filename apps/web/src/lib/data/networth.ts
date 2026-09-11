// Net-worth primitives over the `networth` section: the snapshot trend, where the money sits, the
// growth decomposition, and the targets derived from your own spending.

import type { DashboardData, NetWorthSnapshot } from '$lib/data/types';
import type {
	Bullet,
	BulletRow,
	Categorical,
	MultiSeries,
	Scalar,
	Series,
	Table,
	Tone
} from './primitives';
import { MONEY, MONTHS, PERCENT, YEARS } from './primitives';
import { categorical } from './categorical';
import { series } from './series';
import { measureValue } from './metric';
import { type Scope, scopeYear } from './scope';
import { money } from '$lib/utils/format';
import { yearOf } from '$lib/utils/period';
import { live, words, type Label } from '$lib/ui/label';

/** Allocation buckets in display order (mirrors the backend `BUCKETS`). */
const BUCKETS = ['Liquid', 'Taxable', 'Tax-advantaged'];

/** Years a KPI's yearly underlay looks back over. */
const WINDOW_YEARS = 10;

function snapshots(data: DashboardData): NetWorthSnapshot[] {
	return data.networth?.series ?? [];
}

/** Every year a snapshot falls in, ascending. */
export function snapshotYears(data: DashboardData): number[] {
	return [...new Set(snapshots(data).map((p) => yearOf(p.date)))];
}

function forYear(data: DashboardData, year: number): NetWorthSnapshot[] {
	return snapshots(data).filter((p) => p.date.startsWith(`${year}-`));
}

/** Asset accounts only — liabilities are held and reported separately. */
function assetAccounts(data: DashboardData) {
	return (data.networth?.accounts ?? []).filter((a) => a.group !== 'liability');
}

/** One snapshot field per logged snapshot — lifetime (`year` omitted) or one year's. */
function snapshotSeries(
	data: DashboardData,
	name: string,
	field: 'net_worth' | 'assets' | 'liabilities',
	year?: number
): Series {
	const points = year == null ? snapshots(data) : forYear(data, year);
	return series(
		name,
		points.map((p) => p.date),
		points.map((p) => p[field]),
		MONEY(data.currency)
	);
}

/** These figures are signed decompositions, so their sign IS their meaning. */
function bySign(value: number): Tone {
	return value >= 0 ? 'good' : 'bad';
}

/** A current-value scalar; net worth also carries its change since the previous snapshot. */
export function netWorthScalar(
	data: DashboardData,
	field: 'net_worth' | 'assets' | 'liabilities',
	label: Label
): Scalar {
	const unit = MONEY(data.currency);
	const current = data.networth?.current ?? null;
	const value = current ? current[field] : null;

	const s: Scalar = { kind: 'scalar', unit, label, value };

	// `current` is today's live total, whose date may already be the last logged series point — skip
	// that point when it is, so the delta never compares a snapshot against itself.
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
	return snapshotSeries(data, 'Net worth', 'net_worth', year);
}

/**
 * Net worth and assets over time. The *gap* between them is what is owed, so the page draws assets
 * dashed to keep net worth the primary line.
 */
export function netWorthVsAssets(data: DashboardData): MultiSeries {
	const unit = MONEY(data.currency);
	const points = snapshots(data);
	const labels = points.map((p) => p.date);

	return {
		kind: 'multiseries',
		unit,
		axis: 'time',
		labels,
		series: [
			series(
				'Net worth',
				labels,
				points.map((p) => p.net_worth),
				unit
			),
			series(
				'Assets',
				labels,
				points.map((p) => p.assets),
				unit
			)
		]
	};
}

/**
 * A snapshot field at the close of each logged year, most recent `WINDOW_YEARS` only. A KPI's underlay is
 * read as a shape rather than a scale, and past a decade of bars the recent years are too thin to tell
 * apart; a shorter history plots whatever it has.
 */
export function netWorthByYear(
	data: DashboardData,
	field: 'net_worth' | 'assets' | 'liabilities',
	name: string
): Series {
	const years = snapshotYears(data).slice(-WINDOW_YEARS);
	return series(
		name,
		years.map(String),
		years.map((year) => bounds(data, { level: 'year', year }).close?.[field] ?? null),
		MONEY(data.currency)
	);
}

/** Liabilities over time on their own — illegible as a third line against a net-worth axis. */
export function netWorthLiabilities(data: DashboardData, year?: number): Series {
	return snapshotSeries(data, 'Liabilities', 'liabilities', year);
}

/** A year's snapshots with change since the previous one. */
export function netWorthMonthlyTable(data: DashboardData, year: number): Table {
	const unit = MONEY(data.currency);
	const all = snapshots(data);
	const rows = forYear(data, year).map((p) => {
		const i = all.findIndex((q) => q.date === p.date);
		const prev = i > 0 ? all[i - 1] : null;
		const change = prev ? p.net_worth - prev.net_worth : 0;
		const pct = prev && prev.net_worth ? (change / prev.net_worth) * 100 : 0;
		return [p.date, p.net_worth, p.assets, p.liabilities, change, pct];
	});
	return {
		kind: 'table',
		columns: [
			{ label: 'Date' },
			{ label: 'Net worth', unit },
			{ label: 'Assets', unit },
			{ label: 'Liabilities', unit },
			{ label: 'Change', unit },
			{ label: 'Change %', unit: PERCENT }
		],
		rows
	};
}

/** Each bucket's share of assets over time — shares, since the dollar level is the trend's job. */
export function netWorthAllocationShare(data: DashboardData, year?: number): MultiSeries {
	const points = year == null ? snapshots(data) : forYear(data, year);
	const labels = points.map((p) => p.date);

	return {
		kind: 'multiseries',
		unit: PERCENT,
		axis: 'time',
		labels,
		series: BUCKETS.map((b) =>
			series(
				b,
				labels,
				points.map((p) => (p.assets ? ((p.breakdown[b] ?? 0) / p.assets) * 100 : 0)),
				PERCENT
			)
		)
	};
}

/**
 * Every asset account by value, largest first. Assets only: this is a parts-of-a-whole ranking, and
 * a negative bar has no share of a total.
 */
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
// The remainder stays one term: an investment account is snapshotted as a single currency figure whose
// pad absorbs both market growth and unlogged flow, so splitting them would be a guess.

/** The snapshots bounding a scope: the balance it started from, and the last one within it. */
function bounds(
	data: DashboardData,
	scope: Scope
): { open: NetWorthSnapshot | null; close: NetWorthSnapshot | null } {
	const all = snapshots(data);
	if (scope.level === 'all') {
		return { open: all[0] ?? null, close: all[all.length - 1] ?? null };
	}

	const year = scopeYear(data, scope);
	const within = forYear(data, year);
	const before = all.filter((p) => p.date < `${year}-01-01`);
	return {
		// A year opens at the last snapshot before it — the balance the year started from.
		open: before[before.length - 1] ?? within[0] ?? null,
		close: within[within.length - 1] ?? null
	};
}

/** The change in net worth over a scope, or 0 when it can't be bounded. */
function changeOver(data: DashboardData, scope: Scope): number {
	const { open, close } = bounds(data, scope);
	return open && close ? close.net_worth - open.net_worth : 0;
}

/** A decomposition term's share of the period's change, as its note. The share is read off the data, so
    it is the derived half; the fallback is prose and stays renameable. */
function shareNote(part: number, change: number, fallback: string): Label {
	return change ? live(`${Math.round((part / change) * 100)}% of the change`) : words(fallback);
}

/** Net worth at the end of a scope, with its change over that scope as a delta. The level itself is
    untoned — it is a position, not a verdict; the delta carries the news. */
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
	const saved = measureValue(data, scope, 'saved');

	return {
		kind: 'scalar',
		unit: MONEY(data.currency),
		label: words('You saved'),
		value: saved,
		tone: bySign(saved),
		note: shareNote(saved, changeOver(data, scope), 'income − spending')
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

	const change = close.net_worth - open.net_worth;
	const other = change - measureValue(data, scope, 'saved');

	return {
		kind: 'scalar',
		unit: MONEY(data.currency),
		label: words('Market & other'),
		value: other,
		tone: bySign(other),
		note: shareNote(other, change, 'growth + unlogged flow')
	};
}

/** Saved vs everything-else per year — which force did the work. */
export function savedVsOther(data: DashboardData): MultiSeries {
	const unit = MONEY(data.currency);
	const years = snapshotYears(data);
	const labels = years.map(String);

	const saved: number[] = [];
	const other: number[] = [];
	for (const year of years) {
		const scope: Scope = { level: 'year', year };
		const s = measureValue(data, scope, 'saved');
		saved.push(s);
		other.push(changeOver(data, scope) - s);
	}

	return {
		kind: 'multiseries',
		unit,
		axis: 'ordinal',
		labels,
		series: [
			series('You saved', labels, saved, unit),
			series('Market & other', labels, other, unit)
		]
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

/** Annualized spending over the trailing year of months with data — the lifestyle to size against. */
function trailingAnnualSpend(data: DashboardData): number {
	const keys = data.meta.month_keys.filter((k) => data.months[k]).slice(-12);
	if (!keys.length) return 0;

	const total = keys.reduce(
		(sum, k) => sum + measureValue(data, { level: 'month', monthKey: k }, 'spending'),
		0
	);
	// Scale by months present, not a flat year, so an early ledger isn't flattered.
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
	const current = data.networth?.current?.net_worth ?? null;

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
	const current = data.networth?.current?.net_worth ?? null;

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
	const current = data.networth?.current?.net_worth ?? null;

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
 * Compound annual growth of the balance, as a percentage. Not a return: contributions are included,
 * so it overstates investment performance. Null under half a year of history, where annualizing is
 * meaningless.
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
		note: words('per year — contributions included, not a return')
	};
}

/** The largest single account as a share of assets — concentration risk, and where it sits. */
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
 * Cash runway, the FI number and Coast FI as one bullet set. Each row reuses the scalar that already
 * computes it, so a gauge can't disagree with the tile beside it; rows with no value are dropped
 * rather than drawn empty.
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
			// Bands are relative to the target, so changing the setting moves the shading with it.
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
