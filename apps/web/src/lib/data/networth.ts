// Net-worth primitives over the `networth` section: the monthly trend (net worth + assets +
// liabilities), the current per-account breakdown, the untracked-flow adjustments table, and
// current-value scalars. Pure over the contract; colour is assigned by the chart registry.

import type { DashboardData, NetWorthSnapshot } from '$lib/data/types';
import type { Categorical, MultiSeries, Scalar, Series, Table } from './primitives';
import { MONEY, PERCENT } from './primitives';
import { categorical } from './categorical';
import { series } from './series';

/** Allocation buckets in display order (mirrors the backend `BUCKETS`). */
const BUCKETS = ['Liquid', 'Taxable', 'Tax-advantaged'];

function snapshots(data: DashboardData): NetWorthSnapshot[] {
	return data.networth?.series ?? [];
}

function forYear(data: DashboardData, year: number): NetWorthSnapshot[] {
	return snapshots(data).filter((p) => p.month.startsWith(`${year}-`));
}

/** Net worth, assets, and liabilities as three overlaid lines over the snapshot months. */
export function netWorthTrend(data: DashboardData): MultiSeries {
	const unit = MONEY(data.currency);
	const points = data.networth?.series ?? [];
	const labels = points.map((p) => p.month);

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
			),
			series(
				'Liabilities',
				labels,
				points.map((p) => p.liabilities),
				unit
			)
		]
	};
}

/** Current balances for one balance-sheet group as a categorical (largest first). */
export function netWorthByAccount(
	data: DashboardData,
	group: 'cash' | 'investment' = 'investment'
): Categorical {
	const accounts = (data.networth?.accounts ?? []).filter((a) => a.group === group);
	return categorical(
		accounts.map((a) => ({ category: a.label, amount: a.value })),
		MONEY(data.currency),
		999
	);
}

/** Per-account cumulative untracked-flow plug (the sanity check on unlogged transfers). */
export function netWorthAdjustments(data: DashboardData): Table {
	const money = MONEY(data.currency);
	return {
		kind: 'table',
		columns: [{ label: 'Account' }, { label: 'Untracked Δ', unit: money }],
		rows: (data.networth?.adjustments ?? []).map((a) => [a.label, a.value])
	};
}

/** A current-value scalar; net worth also carries its change since the previous snapshot. */
export function netWorthScalar(
	data: DashboardData,
	field: 'net_worth' | 'assets' | 'liabilities',
	label: string
): Scalar {
	const unit = MONEY(data.currency);
	const current = data.networth?.current ?? null;
	const value = current ? current[field] : null;

	const s: Scalar = { kind: 'scalar', unit, label, value };

	// Change since the previous *distinct* snapshot: `current` is today's live total, whose month
	// may or may not already be the last logged series point — skip that point when it is, so the
	// delta never compares a month against itself.
	const points = data.networth?.series ?? [];
	const last = points[points.length - 1];
	const prev = last && current && last.month === current.month ? points[points.length - 2] : last;
	if (field === 'net_worth' && prev && value != null) {
		const change = value - prev.net_worth;
		s.dir = change >= 0 ? 'up' : 'down';
		s.delta = { value: change, unit, dir: change >= 0 ? 'up' : 'down', note: 'since last' };
	}

	return s;
}

// --- allocation (where the money is: liquid / taxable / tax-advantaged) ---

/** Current asset allocation across buckets, as a categorical (for a donut). */
export function netWorthAllocation(data: DashboardData): Categorical {
	const breakdown = data.networth?.current?.breakdown ?? {};
	return categorical(
		BUCKETS.filter((b) => b in breakdown).map((b) => ({ category: b, amount: breakdown[b]! })),
		MONEY(data.currency),
		999
	);
}

/** Asset allocation over time — one line per bucket across the snapshot months. */
export function netWorthAllocationTrend(data: DashboardData): MultiSeries {
	const unit = MONEY(data.currency);
	const points = snapshots(data);
	const labels = points.map((p) => p.month);
	return {
		kind: 'multiseries',
		unit,
		axis: 'time',
		labels,
		series: BUCKETS.map((b) =>
			series(
				b,
				labels,
				points.map((p) => p.breakdown[b] ?? 0),
				unit
			)
		)
	};
}

/** Total invested (taxable + tax-advantaged) as a scalar. */
export function netWorthInvested(data: DashboardData): Scalar {
	const b = data.networth?.current?.breakdown;
	const value = b ? (b['Taxable'] ?? 0) + (b['Tax-advantaged'] ?? 0) : null;
	return { kind: 'scalar', unit: MONEY(data.currency), label: 'Invested', value };
}

/** Liquid (cash) holdings as a scalar. */
export function netWorthLiquid(data: DashboardData): Scalar {
	const value = data.networth?.current?.breakdown?.['Liquid'] ?? null;
	return { kind: 'scalar', unit: MONEY(data.currency), label: 'Liquid', value };
}

// --- yearly ---

/** Net worth per snapshot month — lifetime (`year` omitted) or one year's months. */
export function netWorthByMonth(data: DashboardData, year?: number): Series {
	const points = year == null ? snapshots(data) : forYear(data, year);
	return series(
		'Net worth',
		points.map((p) => p.month),
		points.map((p) => p.net_worth),
		MONEY(data.currency)
	);
}

/** A year's monthly snapshots with month-over-month change (mirrors the spreadsheet table). */
export function netWorthMonthlyTable(data: DashboardData, year: number): Table {
	const money = MONEY(data.currency);
	const all = snapshots(data);
	const rows = forYear(data, year).map((p) => {
		const i = all.findIndex((q) => q.month === p.month);
		const prev = i > 0 ? all[i - 1] : null;
		const change = prev ? p.net_worth - prev.net_worth : 0;
		const pct = prev && prev.net_worth ? (change / prev.net_worth) * 100 : 0;
		return [p.month, p.net_worth, p.assets, p.liabilities, change, pct];
	});
	return {
		kind: 'table',
		columns: [
			{ label: 'Month' },
			{ label: 'Net worth', unit: money },
			{ label: 'Assets', unit: money },
			{ label: 'Liabilities', unit: money },
			{ label: 'Change', unit: money },
			{ label: 'Change %', unit: PERCENT }
		],
		rows
	};
}
