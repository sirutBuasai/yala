// The data catalog: the registry of named, bindable data instances. Each entry
// knows what primitive KIND it produces and at which scopes, and builds a concrete
// primitive from the dashboard document. This is what a "pick your data" UI reads;
// the chart registry then answers "which charts can draw this kind?".

import type { DashboardData } from '$lib/data/types';
import type { Primitive, PrimitiveKind } from './primitives';
import { MONEY } from './primitives';
import { categorical, categoryDeviation, whereItWent } from './categorical';
import {
	categorySpendByYear,
	cumulativeSaved,
	incomeByMonth,
	incomeByYear,
	incomeSpentSaved,
	savingsRate,
	spendingByMonth,
	spendingByYear
} from '$lib/data/series';
import { moneyFlow } from './flow';
import { categoryByMonth } from './matrix';
import { paychecks } from './table';
import {
	netWorthAdjustments,
	netWorthAllocation,
	netWorthAllocationTrend,
	netWorthByAccount,
	netWorthByMonth,
	netWorthInvested,
	netWorthLiquid,
	netWorthMonthlyTable,
	netWorthScalar,
	netWorthTrend
} from './networth';
import { type Scope, type ScopeLevel, scopeYear } from './scope';
import {
	amount,
	average,
	categoryAmount,
	categoryShare,
	change,
	componentKeys,
	count,
	extremum,
	ratio,
	signed,
	vsTypical,
	type Countable,
	type ExtremumOf,
	type Measure
} from './metric';

export type { Scope, ScopeLevel } from './scope';

interface DataDef {
	id: string;
	label: string;
	kind: PrimitiveKind;
	/** Scope levels this data supports. */
	scopes: ScopeLevel[];
	build(data: DashboardData, scope: Scope): Primitive;
}

// --- chart definitions: multi-value data (categorical, series, flow, matrix, table) ---

const CHART_DEFS: DataDef[] = [
	{
		id: 'spending.by_category',
		label: 'Spending by category',
		kind: 'categorical',
		scopes: ['all', 'year', 'month'],
		build(data, scope) {
			const unit = MONEY(data.currency);
			if (scope.level === 'month' && scope.monthKey) {
				return categorical(data.months[scope.monthKey]?.by_category ?? [], unit, 999);
			}
			if (scope.level === 'year') {
				const yd = data.years[String(scopeYear(data, scope))];
				const items = data.meta.categories.map((c) => ({
					category: c,
					amount: yd ? yd.matrix.reduce((sum, row) => sum + (row.spent[c] ?? 0), 0) : 0
				}));
				return categorical(items, unit, 999);
			}
			return categorical(data.overview.all_time_by_category, unit, 999);
		}
	},
	{
		id: 'spending.where_it_went',
		label: 'Where it went (with savings)',
		kind: 'categorical',
		scopes: ['all', 'month'],
		build(data, scope) {
			const unit = MONEY(data.currency);
			if (scope.level === 'month' && scope.monthKey) {
				const md = data.months[scope.monthKey];
				return whereItWent(
					md?.by_category ?? [],
					md?.total_income ?? 0,
					md?.total_spent ?? 0,
					unit
				);
			}
			const income = data.overview.by_year.reduce((a, r) => a + r.income, 0);
			const spent = data.overview.by_year.reduce((a, r) => a + r.spent, 0);
			return whereItWent(data.overview.all_time_by_category, income, spent, unit);
		}
	},
	{
		id: 'spending.by_month',
		label: 'Spending by month',
		kind: 'series',
		scopes: ['all', 'year'],
		build: (data, scope) =>
			scope.level === 'all' ? spendingByMonth(data) : spendingByMonth(data, scopeYear(data, scope))
	},
	{
		id: 'spending.by_year',
		label: 'Spending by year',
		kind: 'series',
		scopes: ['all'],
		build: (data) => spendingByYear(data)
	},
	{
		id: 'spending.category_by_month',
		label: 'Category by month',
		kind: 'matrix',
		scopes: ['year'],
		build: (data, scope) => categoryByMonth(data, scopeYear(data, scope))
	},
	{
		id: 'spending.category_by_year',
		label: 'Category by year',
		kind: 'multiseries',
		scopes: ['all'],
		build: (data) => categorySpendByYear(data)
	},
	{
		id: 'spending.vs_average',
		label: 'Unusual this month',
		kind: 'categorical',
		scopes: ['month'],
		build: (data, scope) =>
			scope.monthKey
				? categoryDeviation(data, scope.monthKey)
				: { kind: 'categorical', unit: MONEY(data.currency), points: [] }
	},
	{
		id: 'income.by_month',
		label: 'Income by month',
		kind: 'series',
		scopes: ['all', 'year'],
		build: (data, scope) =>
			scope.level === 'all' ? incomeByMonth(data) : incomeByMonth(data, scopeYear(data, scope))
	},
	{
		id: 'income.by_year',
		label: 'Income by year',
		kind: 'series',
		scopes: ['all'],
		build: (data) => incomeByYear(data)
	},
	{
		id: 'income.paychecks',
		label: 'Paychecks',
		kind: 'table',
		scopes: ['all', 'year', 'month'],
		build(data, scope) {
			if (scope.level === 'month' && scope.monthKey) return paychecks(data, scope.monthKey);
			if (scope.level === 'year') return paychecks(data, String(scopeYear(data, scope)));
			return paychecks(data);
		}
	},
	{
		id: 'overview.income_spent_saved',
		label: 'Income vs Spending vs Savings',
		kind: 'multiseries',
		scopes: ['all', 'year'],
		build: (data, scope) =>
			scope.level === 'year'
				? incomeSpentSaved(data, scopeYear(data, scope))
				: incomeSpentSaved(data)
	},
	{
		id: 'overview.cumulative_saved',
		label: 'Cumulative savings',
		kind: 'series',
		scopes: ['all'],
		build: (data) => cumulativeSaved(data)
	},
	{
		id: 'overview.savings_rate',
		label: 'Savings rate',
		kind: 'series',
		scopes: ['all'],
		build: (data) => savingsRate(data)
	},
	{
		id: 'money.flow',
		label: 'Money flow',
		kind: 'flow',
		scopes: ['all', 'year'],
		build: (data, scope) =>
			moneyFlow(data, scope.level === 'year' ? scopeYear(data, scope) : undefined)
	},
	{
		id: 'networth.trend',
		label: 'Net worth over time',
		kind: 'multiseries',
		scopes: ['all'],
		build: (data) => netWorthTrend(data)
	},
	{
		id: 'networth.by_month',
		label: 'Net worth by month',
		kind: 'series',
		scopes: ['all', 'year'],
		build: (data, scope) =>
			netWorthByMonth(data, scope.level === 'year' ? scopeYear(data, scope) : undefined)
	},
	{
		id: 'networth.monthly_table',
		label: 'Monthly net worth',
		kind: 'table',
		scopes: ['year'],
		build: (data, scope) => netWorthMonthlyTable(data, scopeYear(data, scope))
	},
	{
		id: 'networth.allocation',
		label: 'Allocation',
		kind: 'categorical',
		scopes: ['all'],
		build: (data) => netWorthAllocation(data)
	},
	{
		id: 'networth.allocation_trend',
		label: 'Allocation over time',
		kind: 'multiseries',
		scopes: ['all'],
		build: (data) => netWorthAllocationTrend(data)
	},
	{
		id: 'networth.investments',
		label: 'Investments by account',
		kind: 'categorical',
		scopes: ['all'],
		build: (data) => netWorthByAccount(data, 'investment')
	},
	{
		id: 'networth.cash',
		label: 'Cash by account',
		kind: 'categorical',
		scopes: ['all'],
		build: (data) => netWorthByAccount(data, 'cash')
	},
	{
		id: 'networth.adjustments',
		label: 'Untracked adjustments',
		kind: 'table',
		scopes: ['all'],
		build: (data) => netWorthAdjustments(data)
	}
];

const NETWORTH_STATS: DataDef[] = [
	...[
		{ id: 'networth.current', label: 'Net worth', field: 'net_worth' as const },
		{ id: 'networth.assets', label: 'Assets', field: 'assets' as const },
		{ id: 'networth.liabilities', label: 'Liabilities', field: 'liabilities' as const }
	].map((s) => ({
		id: s.id,
		label: s.label,
		kind: 'scalar' as const,
		scopes: ['all'] as ScopeLevel[],
		build: (data: DashboardData) => netWorthScalar(data, s.field, s.label)
	})),
	{
		id: 'networth.invested',
		label: 'Invested',
		kind: 'scalar',
		scopes: ['all'],
		build: (data) => netWorthInvested(data)
	},
	{
		id: 'networth.liquid',
		label: 'Liquid',
		kind: 'scalar',
		scopes: ['all'],
		build: (data) => netWorthLiquid(data)
	}
];

// --- stat definitions: single-figure data (scalar metrics) ---
//
// Named instances of the metric builders. Kept data-config-driven (small tables →
// generated entries) rather than one hand-written entry per metric.

const ALL_SCOPES: ScopeLevel[] = ['all', 'year', 'month'];

function scalarDef(
	id: string,
	label: string,
	scopes: ScopeLevel[],
	build: (data: DashboardData, scope: Scope) => Primitive
): DataDef {
	return { id, label, kind: 'scalar', scopes, build };
}

const AMOUNTS: { id: string; label: string; field: Measure; signed?: boolean }[] = [
	{ id: 'income.total', label: 'Income', field: 'income' },
	{ id: 'spending.total', label: 'Spending', field: 'spending' },
	{ id: 'saved.total', label: 'Saved', field: 'saved', signed: true },
	{ id: 'income.gross', label: 'Gross', field: 'gross' },
	{ id: 'income.deductions', label: 'Deductions', field: 'deductions' },
	{ id: 'income.contributions', label: 'Contributions', field: 'contributions' },
	{ id: 'income.net', label: 'Net', field: 'net' },
	{ id: 'income.takehome', label: 'Take-home', field: 'takehome' }
];

const RATIOS: { id: string; label: string; num: Measure; den: Measure }[] = [
	{ id: 'ratio.savings_rate', label: 'Savings rate', num: 'saved', den: 'income' },
	{ id: 'ratio.percent_used', label: '% of income used', num: 'spending', den: 'income' },
	{ id: 'ratio.deduction_rate', label: 'Deduction rate', num: 'deductions', den: 'gross' }
];

const PER_MONTH: { id: string; label: string; field: Measure; signed?: boolean }[] = [
	{ id: 'avg.income_per_month', label: 'Avg income / month', field: 'income' },
	{ id: 'avg.spending_per_month', label: 'Avg spending / month', field: 'spending' },
	{ id: 'avg.saved_per_month', label: 'Avg saved / month', field: 'saved', signed: true }
];

const PER_YEAR: { id: string; label: string; field: Measure; signed?: boolean }[] = [
	{ id: 'avg.income_per_year', label: 'Avg income / year', field: 'income' },
	{ id: 'avg.spending_per_year', label: 'Avg spending / year', field: 'spending' },
	{ id: 'avg.saved_per_year', label: 'Avg saved / year', field: 'saved', signed: true }
];

const COUNTS: { id: string; label: string; of: Countable }[] = [
	{ id: 'count.transactions', label: 'Transactions', of: 'transactions' },
	{ id: 'count.paychecks', label: 'Paychecks', of: 'paychecks' },
	{ id: 'count.active_months', label: 'Active months', of: 'active_months' },
	{ id: 'count.categories', label: 'Categories', of: 'categories' }
];

const EXTREMA: { id: string; label: string; of: ExtremumOf; scopes: ScopeLevel[] }[] = [
	{ id: 'max.category', label: 'Biggest category', of: 'category', scopes: ALL_SCOPES },
	{ id: 'max.transaction', label: 'Biggest transaction', of: 'transaction', scopes: ALL_SCOPES },
	{ id: 'max.month', label: 'Biggest month', of: 'month', scopes: ['all', 'year'] }
];

const CHANGES: {
	id: string;
	label: string;
	field: Measure;
	period: 'year' | 'month';
	scopes: ScopeLevel[];
}[] = [
	{
		id: 'change.income_yoy',
		label: 'Income (YoY)',
		field: 'income',
		period: 'year',
		scopes: ['year']
	},
	{
		id: 'change.spending_yoy',
		label: 'Spending (YoY)',
		field: 'spending',
		period: 'year',
		scopes: ['year']
	},
	{
		id: 'change.income_mom',
		label: 'Income (MoM)',
		field: 'income',
		period: 'month',
		scopes: ['month']
	},
	{
		id: 'change.spending_mom',
		label: 'Spending (MoM)',
		field: 'spending',
		period: 'month',
		scopes: ['month']
	}
];

// A month against its own trailing norm — the "is this month normal?" tile.
const VS_TYPICAL: DataDef[] = [
	scalarDef('spending.vs_typical', 'vs your average', ['month'], (data, scope) =>
		scope.monthKey
			? vsTypical(data, scope.monthKey, 'spending', { label: 'vs your average' })
			: {
					kind: 'scalar',
					unit: MONEY(data.currency),
					label: 'vs your average',
					value: null
				}
	)
];

const STAT_DEFS: DataDef[] = [
	...AMOUNTS.map((a) =>
		scalarDef(a.id, a.label, ALL_SCOPES, (data, scope) => {
			const s = amount(data, scope, a.field, { label: a.label });
			return a.signed ? signed(s) : s;
		})
	),
	...RATIOS.map((r) =>
		scalarDef(r.id, r.label, ALL_SCOPES, (data, scope) =>
			ratio(data, scope, r.num, r.den, { label: r.label })
		)
	),
	...PER_MONTH.map((m) =>
		scalarDef(m.id, m.label, ['year'], (data, scope) => {
			const s = average(data, m.field, 'month', scope.year, { label: m.label });
			return m.signed ? signed(s) : s;
		})
	),
	...PER_YEAR.map((m) =>
		scalarDef(m.id, m.label, ['all'], (data) => {
			const s = average(data, m.field, 'year', undefined, { label: m.label });
			return m.signed ? signed(s) : s;
		})
	),
	...COUNTS.map((c) =>
		scalarDef(c.id, c.label, ALL_SCOPES, (data, scope) => count(data, scope, c.of))
	),
	...EXTREMA.map((e) =>
		scalarDef(e.id, e.label, e.scopes, (data, scope) =>
			extremum(data, scope, e.of, 'max', { label: e.label })
		)
	),
	...CHANGES.map((c) =>
		scalarDef(c.id, c.label, c.scopes, (data, scope) =>
			change(data, c.field, c.period, c.period === 'year' ? scope.year : scope.monthKey, {
				label: c.label
			})
		)
	)
];

export const CATALOG: DataDef[] = [...CHART_DEFS, ...STAT_DEFS, ...VS_TYPICAL, ...NETWORTH_STATS];

export const CATALOG_BY_ID: Record<string, DataDef> = Object.fromEntries(
	CATALOG.map((d) => [d.id, d])
);

/** Catalog entries producing a given primitive kind — powers "pick data for this chart". */
export function dataOfKind(kind: PrimitiveKind): DataDef[] {
	return CATALOG.filter((d) => d.kind === kind);
}

/** Convenience: build a primitive by catalog id. */
export function build(data: DashboardData, id: string, scope: Scope): Primitive {
	const def = CATALOG_BY_ID[id];
	if (!def) throw new Error(`unknown catalog id: ${id}`);
	return def.build(data, scope);
}

// --- data-dependent metric defs ---
// These can't be static: their instances come from the loaded document (which categories
// exist, which paycheck line-items appear). A picker enumerates them per document/scope.

/** Per-category scalar metrics (spend + share of spending) over the tracked categories. */
export function categoryMetricDefs(data: DashboardData): DataDef[] {
	return data.meta.categories.flatMap((c) => [
		scalarDef(`category.${c}.amount`, `${c} spend`, ALL_SCOPES, (d, s) => categoryAmount(d, s, c)),
		scalarDef(`category.${c}.share`, `${c} share`, ALL_SCOPES, (d, s) =>
			categoryShare(d, s, c, 'spending')
		)
	]);
}

/** Per-line-item paycheck scalar metrics (Tax, 401k, …) present in a scope's paychecks. */
export function componentMetricDefs(data: DashboardData, scope: Scope): DataDef[] {
	const { deductions, contributions } = componentKeys(data, scope);
	const mk = (group: 'deductions' | 'contributions', key: string) =>
		scalarDef(`paycheck.${group}.${key}`, key, ALL_SCOPES, (d, s) => amount(d, s, { group, key }));
	return [
		...deductions.map((k) => mk('deductions', k)),
		...contributions.map((k) => mk('contributions', k))
	];
}
