// The data catalog: named, bindable data instances. Each entry declares what primitive kind it
// produces and at which scopes, and builds it from the dashboard document. The chart registry then
// answers which charts can draw that kind.

import type { DashboardData } from '$lib/data/types';
import type { Primitive, PrimitiveKind } from './primitives';
import { MONEY } from './primitives';
import { categorical, categoryDeviation, whereItWent } from './categorical';
import {
	accumulate,
	categorySpendByYear,
	incomeSpentSaved,
	measureActive,
	measureByMonth,
	measureByYear,
	measureTrailing,
	savingsRate
} from '$lib/data/series';
import { moneyFlow } from './flow';
import { categoryByMonth } from './matrix';
import { paychecks } from './table';
import {
	balanceGrowth,
	coastFi,
	fiNumber,
	fiProgress,
	liquidRunway,
	netWorthAccounts,
	netWorthAllocationShare,
	netWorthByMonth,
	netWorthChange,
	netWorthLiabilities,
	netWorthMonthlyTable,
	netWorthOther,
	netWorthSaved,
	netWorthScalar,
	netWorthThresholds,
	netWorthVsAssets,
	netWorthYearTable,
	savedVsOther,
	topAccountShare,
	yearsOfFreedom
} from './networth';
import { type Scope, type ScopeLevel, latestMonthKey, scopeYear } from './scope';
import {
	amount,
	average,
	categoryAmount,
	categoryShare,
	change,
	componentKeys,
	count,
	extremum,
	measureLabel,
	ratio,
	signed,
	vsTypical,
	type Countable,
	type ExtremumOf,
	type Field,
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

// --- multi-value data (categorical, series, flow, matrix, table) ---

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
		id: 'networth.vs_assets',
		label: 'Net worth & assets over time',
		kind: 'multiseries',
		scopes: ['all'],
		build: (data) => netWorthVsAssets(data)
	},
	{
		id: 'networth.thresholds',
		label: 'Progress to thresholds',
		kind: 'bullet',
		scopes: ['all'],
		build: (data) => netWorthThresholds(data)
	},
	{
		id: 'networth.liabilities_trend',
		label: 'Liabilities over time',
		kind: 'series',
		scopes: ['all', 'year'],
		build: (data, scope) =>
			netWorthLiabilities(data, scope.level === 'year' ? scopeYear(data, scope) : undefined)
	},
	{
		id: 'networth.allocation_share',
		label: 'Allocation mix over time',
		kind: 'multiseries',
		scopes: ['all', 'year'],
		build: (data, scope) =>
			netWorthAllocationShare(data, scope.level === 'year' ? scopeYear(data, scope) : undefined)
	},
	{
		id: 'networth.accounts',
		label: 'Where the money sits',
		kind: 'categorical',
		scopes: ['all'],
		build: (data) => netWorthAccounts(data)
	},
	{
		id: 'networth.saved_vs_other',
		label: 'You vs the market, by year',
		kind: 'multiseries',
		scopes: ['all'],
		build: (data) => savedVsOther(data)
	},
	{
		id: 'networth.year_table',
		label: 'Year by year',
		kind: 'table',
		scopes: ['all'],
		build: (data) => netWorthYearTable(data)
	}
];

// --- one measure over time ---
//
// Generated from two small tables over the SAME measures the scalars use, so a KPI's chart and its
// number can never be built from different definitions of the figure.

/** Measures with a period-by-period trend. Month scope reads as the trailing twelve. */
const TRENDS: Field[] = ['income', 'spending', 'saved'];

/** Measures with a running total — the shape of an accumulation, not a level. */
const RUNNING: Field[] = ['gross', 'deductions', 'contributions', 'net', 'saved'];

// A running total comes in two windows, because the two answer different questions. `running.*` spans
// the months the measure MOVED in, so a year-to-date accumulation fills its chart instead of reaching
// its total in July and drawing a flat line to December. `revolving.*` spans the last twelve months
// whatever the calendar says, which is the one that keeps its meaning across a year boundary.
const SERIES_DEFS: DataDef[] = [
	...TRENDS.map((f): DataDef => ({
		id: `trend.${f}`,
		label: `${measureLabel(f)} over time`,
		kind: 'series',
		scopes: ['all', 'year', 'month'],
		build: (data, scope) =>
			scope.level === 'month'
				? measureTrailing(data, f, scope.monthKey || latestMonthKey(data))
				: measureByMonth(data, f, scope.level === 'year' ? scopeYear(data, scope) : undefined)
	})),
	...RUNNING.map((f): DataDef => ({
		id: `running.${f}`,
		label: `${measureLabel(f)}, running total`,
		kind: 'series',
		scopes: ['all', 'year'],
		build: (data, scope) =>
			accumulate(
				scope.level === 'year'
					? measureActive(data, f, scopeYear(data, scope))
					: measureByYear(data, f)
			)
	})),
	...RUNNING.map((f): DataDef => ({
		id: `revolving.${f}`,
		label: `${measureLabel(f)}, running total over 12 months`,
		kind: 'series',
		scopes: ['all', 'year', 'month'],
		build: (data, scope) =>
			accumulate(measureTrailing(data, f, scope.monthKey || latestMonthKey(data)))
	}))
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
	// Scope-aware, so a page passes its range rather than there being two sets of ids.
	{
		id: 'networth.change',
		label: 'Net worth',
		kind: 'scalar',
		scopes: ['all', 'year'],
		build: (data, scope) => netWorthChange(data, scope)
	},
	{
		id: 'networth.saved',
		label: 'You saved',
		kind: 'scalar',
		scopes: ['all', 'year'],
		build: (data, scope) => netWorthSaved(data, scope)
	},
	{
		id: 'networth.other',
		label: 'Market & other',
		kind: 'scalar',
		scopes: ['all', 'year'],
		build: (data, scope) => netWorthOther(data, scope)
	},
	{
		id: 'networth.fi_number',
		label: 'FI number',
		kind: 'scalar',
		scopes: ['all'],
		build: (data) => fiNumber(data)
	},
	{
		id: 'networth.fi_progress',
		label: 'FI progress',
		kind: 'scalar',
		scopes: ['all'],
		build: (data) => fiProgress(data)
	},
	{
		id: 'networth.coast_fi',
		label: 'Coast FI',
		kind: 'scalar',
		scopes: ['all'],
		build: (data) => coastFi(data)
	},
	{
		id: 'networth.years_of_freedom',
		label: 'Years of freedom',
		kind: 'scalar',
		scopes: ['all'],
		build: (data) => yearsOfFreedom(data)
	},
	{
		id: 'networth.runway',
		label: 'Liquid runway',
		kind: 'scalar',
		scopes: ['all'],
		build: (data) => liquidRunway(data)
	},
	{
		id: 'networth.balance_growth',
		label: 'Balance growth',
		kind: 'scalar',
		scopes: ['all'],
		build: (data) => balanceGrowth(data)
	},
	{
		id: 'networth.top_account',
		label: 'Top account',
		kind: 'scalar',
		scopes: ['all'],
		build: (data) => topAccountShare(data)
	}
];

// --- single-figure data (scalar metrics) ---
//
// Named instances of the metric builders, generated from small tables rather than hand-written one
// entry per metric.

const ALL_SCOPES: ScopeLevel[] = ['all', 'year', 'month'];

function scalarDef(
	id: string,
	label: string,
	scopes: ScopeLevel[],
	build: (data: DashboardData, scope: Scope) => Primitive
): DataDef {
	return { id, label, kind: 'scalar', scopes, build };
}

// `note` is the figure's CAPTION. It lives here because a caption is part of what a figure means; a
// view that wrote its own would be a second, drift-prone answer to "what is this number".
const AMOUNTS: { id: string; label: string; field: Measure; signed?: boolean; note?: string }[] = [
	{ id: 'income.total', label: 'Income', field: 'income', note: 'take-home + saved' },
	{ id: 'spending.total', label: 'Spent', field: 'spending' },
	{ id: 'saved.total', label: 'Saved', field: 'saved', signed: true },
	{ id: 'income.gross', label: 'Gross', field: 'gross', note: 'before tax & deductions' },
	{ id: 'income.deductions', label: 'Deductions', field: 'deductions', note: 'tax + benefits' },
	{
		id: 'income.contributions',
		label: 'Contributions',
		field: 'contributions',
		note: 'HSA + 401k'
	},
	{ id: 'income.net', label: 'Net income', field: 'net', note: 'take-home + saved' },
	{
		id: 'income.takehome',
		label: 'Take-home',
		field: 'takehome',
		note: 'what reached your account'
	}
];

const RATIOS: { id: string; label: string; num: Measure; den: Measure; note: string }[] = [
	{
		id: 'ratio.savings_rate',
		label: 'Savings rate',
		num: 'saved',
		den: 'income',
		note: 'of income kept'
	},
	{
		id: 'ratio.spending_rate',
		label: 'Spending rate',
		num: 'spending',
		den: 'income',
		note: 'of income spent'
	},
	{
		id: 'ratio.deduction_rate',
		label: 'Deduction rate',
		num: 'deductions',
		den: 'gross',
		note: 'of gross withheld'
	}
];

const PER_MONTH: { id: string; label: string; field: Measure; signed?: boolean }[] = [
	{ id: 'avg.income_per_month', label: 'Avg income / month', field: 'income' },
	{ id: 'avg.spending_per_month', label: 'Avg spent / month', field: 'spending' },
	{ id: 'avg.saved_per_month', label: 'Avg saved / month', field: 'saved', signed: true }
];

const PER_YEAR: { id: string; label: string; field: Measure; signed?: boolean }[] = [
	{ id: 'avg.income_per_year', label: 'Avg income / year', field: 'income' },
	{ id: 'avg.spending_per_year', label: 'Avg spent / year', field: 'spending' },
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

// A level plus its period-over-period badge. Labelled by the measure alone — the badge's own note
// says which period it compares against, so the title doesn't have to.
const CHANGES: { field: Field; period: 'year' | 'month' }[] = [
	{ field: 'income', period: 'year' },
	{ field: 'spending', period: 'year' },
	{ field: 'saved', period: 'year' },
	{ field: 'income', period: 'month' },
	{ field: 'spending', period: 'month' },
	{ field: 'saved', period: 'month' }
];

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
			const s = amount(data, scope, a.field, { label: a.label, note: a.note });
			return a.signed ? signed(s) : s;
		})
	),
	...RATIOS.map((r) =>
		scalarDef(r.id, r.label, ALL_SCOPES, (data, scope) =>
			ratio(data, scope, r.num, r.den, { label: r.label, note: r.note })
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
		scalarDef(
			`change.${c.field}_${c.period === 'year' ? 'yoy' : 'mom'}`,
			measureLabel(c.field),
			[c.period],
			(data, scope) =>
				change(data, c.field, c.period, c.period === 'year' ? scope.year : scope.monthKey)
		)
	)
];

export const CATALOG: DataDef[] = [
	...CHART_DEFS,
	...SERIES_DEFS,
	...STAT_DEFS,
	...VS_TYPICAL,
	...NETWORTH_STATS
];

export const CATALOG_BY_ID: Record<string, DataDef> = Object.fromEntries(
	CATALOG.map((d) => [d.id, d])
);

/** Catalog entries producing a given primitive kind — powers "pick data for this chart". */
export function dataOfKind(kind: PrimitiveKind): DataDef[] {
	return CATALOG.filter((d) => d.kind === kind);
}

/** Build a primitive by catalog id. Throws on an unknown id. */
export function build(data: DashboardData, id: string, scope: Scope): Primitive {
	const def = CATALOG_BY_ID[id];
	if (!def) throw new Error(`unknown catalog id: ${id}`);
	return def.build(data, scope);
}

// --- data-dependent metric defs ---
// These can't be static: their instances come from the loaded document, so a picker enumerates them
// per document and scope.

/** Per-category scalar metrics (spend + share of spending) over the tracked categories. */
export function categoryMetricDefs(data: DashboardData): DataDef[] {
	return data.meta.categories.flatMap((c) => [
		scalarDef(`category.${c}.amount`, `${c} spend`, ALL_SCOPES, (d, s) => categoryAmount(d, s, c)),
		scalarDef(`category.${c}.share`, `${c} share`, ALL_SCOPES, (d, s) =>
			categoryShare(d, s, c, 'spending')
		)
	]);
}

/** Per-line-item paycheck scalar metrics present in a scope's paychecks. */
export function componentMetricDefs(data: DashboardData, scope: Scope): DataDef[] {
	const { deductions, contributions } = componentKeys(data, scope);
	const mk = (group: 'deductions' | 'contributions', key: string) =>
		scalarDef(`paycheck.${group}.${key}`, key, ALL_SCOPES, (d, s) => amount(d, s, { group, key }));
	return [
		...deductions.map((k) => mk('deductions', k)),
		...contributions.map((k) => mk('contributions', k))
	];
}
