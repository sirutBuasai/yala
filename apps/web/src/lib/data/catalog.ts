// The data catalog: named, bindable data instances. Each entry declares the primitive kind it produces
// and the scopes it supports; the chart registry answers which charts can draw that kind.

import type { DashboardData } from '$lib/data/types';
import type { Primitive, PrimitiveKind } from './primitives';
import { MONEY } from './primitives';
import { categorical, whereItWent } from './categorical';
import { categoryDeviation } from './deviation';
import {
	accumulate,
	cashFlowBars,
	categorySpendByYear,
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
	bucketChangeByMonth,
	bucketChangeByYear,
	bucketMonthlyTable,
	bucketYearTable,
	coastFi,
	growthRateByYear,
	fiNumber,
	fiProgress,
	growthByMonth,
	liabilitiesChange,
	liabilitiesChangeByYear,
	liquidRunway,
	netWorthAccounts,
	netWorthAllocationShare,
	netWorthAllocationValue,
	netWorthAssetsChangeByYear,
	netWorthByMonth,
	netWorthAssetsChange,
	netWorthChange,
	netWorthGrowth,
	netWorthGrowthPerYear,
	netWorthGrowthPerMonth,
	netWorthLiabilities,
	netWorthMonthlyTable,
	netWorthOther,
	netWorthSaved,
	netWorthScalar,
	netWorthThresholds,
	netWorthVsAssets,
	netWorthByYear,
	netWorthYearTable,
	savedVsOther,
	savedVsOtherByMonth,
	topAccountShare,
	yearsOfFreedom,
	type GrowthPart
} from './networth';
import { type Scope, type ScopeLevel, latestMonthKey, scopeYear } from './scope';
import { words } from '$lib/ui/label';
import {
	amount,
	average,
	categoryAmount,
	categoryShare,
	change,
	componentKeys,
	count,
	extremum,
	extremumLabel,
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

const LIFETIME: ScopeLevel[] = ['all'];
const YEARLY: ScopeLevel[] = ['all', 'year'];
const ALL_SCOPES: ScopeLevel[] = ['all', 'year', 'month'];

/** The scope's year, or undefined at lifetime scope — what a builder that spans both takes. */
const optionalYear = (data: DashboardData, scope: Scope) =>
	scope.level === 'year' ? scopeYear(data, scope) : undefined;

interface DataDef {
	id: string;
	label: string;
	kind: PrimitiveKind;
	/** Scope levels this data supports. */
	scopes: ScopeLevel[];
	build(data: DashboardData, scope: Scope): Primitive;
}

function scalarDef(
	id: string,
	label: string,
	scopes: ScopeLevel[],
	build: (data: DashboardData, scope: Scope) => Primitive
): DataDef {
	return { id, label, kind: 'scalar', scopes, build };
}

// --- multi-value data (categorical, series, flow, matrix, table) ---

const CHART_DEFS: DataDef[] = [
	{
		id: 'spending.by_category',
		label: 'Spending by category',
		kind: 'categorical',
		scopes: ALL_SCOPES,
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
		scopes: LIFETIME,
		build: (data) => categorySpendByYear(data)
	},
	{
		id: 'spending.vs_average',
		label: 'Unusual this month',
		kind: 'deviation',
		scopes: ['month'],
		build: (data, scope) =>
			scope.monthKey
				? categoryDeviation(data, scope.monthKey)
				: { kind: 'deviation', unit: MONEY(data.currency), rows: [] }
	},
	{
		id: 'income.paychecks',
		label: 'Paychecks',
		kind: 'table',
		scopes: ALL_SCOPES,
		build(data, scope) {
			if (scope.level === 'month' && scope.monthKey) return paychecks(data, scope.monthKey);
			if (scope.level === 'year') return paychecks(data, String(scopeYear(data, scope)));
			return paychecks(data);
		}
	},
	{
		id: 'overview.cash_flow_bars',
		label: 'Net income vs take-home vs spending vs saved',
		kind: 'multiseries',
		scopes: YEARLY,
		build: (data, scope) => cashFlowBars(data, optionalYear(data, scope))
	},
	{
		id: 'overview.savings_rate',
		label: 'Savings rate',
		kind: 'series',
		scopes: LIFETIME,
		build: (data) => savingsRate(data)
	},
	{
		id: 'money.flow',
		label: 'Money flow',
		kind: 'flow',
		scopes: YEARLY,
		build: (data, scope) => moneyFlow(data, optionalYear(data, scope))
	},
	{
		id: 'networth.by_month',
		label: 'Net worth by month',
		kind: 'series',
		scopes: YEARLY,
		build: (data, scope) => netWorthByMonth(data, optionalYear(data, scope))
	},
	{
		id: 'networth.monthly_table',
		label: 'Monthly net worth',
		kind: 'table',
		scopes: ['year'],
		build: (data, scope) => netWorthMonthlyTable(data, scopeYear(data, scope))
	},
	// Where the money landed, as bars and as a table: the same question read as a shape or as figures.
	{
		id: 'networth.bucket_change_by_month',
		label: 'Change by asset type',
		kind: 'multiseries',
		scopes: ['year'],
		build: (data, scope) => bucketChangeByMonth(data, scopeYear(data, scope))
	},
	{
		id: 'networth.bucket_change_by_year',
		label: 'Change by asset type',
		kind: 'multiseries',
		scopes: LIFETIME,
		build: (data) => bucketChangeByYear(data)
	},
	{
		id: 'networth.bucket_monthly_table',
		label: 'Change by asset type',
		kind: 'table',
		scopes: ['year'],
		build: (data, scope) => bucketMonthlyTable(data, scopeYear(data, scope))
	},
	{
		id: 'networth.bucket_year_table',
		label: 'Change by asset type',
		kind: 'table',
		scopes: LIFETIME,
		build: (data) => bucketYearTable(data)
	},
	{
		id: 'networth.vs_assets',
		label: 'Net worth & assets over time',
		kind: 'multiseries',
		scopes: YEARLY,
		build: (data, scope) => netWorthVsAssets(data, optionalYear(data, scope))
	},
	{
		id: 'networth.thresholds',
		label: 'Progress to thresholds',
		kind: 'bullet',
		scopes: LIFETIME,
		build: (data) => netWorthThresholds(data)
	},
	{
		id: 'networth.liabilities_trend',
		label: 'Liabilities over time',
		kind: 'series',
		scopes: YEARLY,
		build: (data, scope) => netWorthLiabilities(data, optionalYear(data, scope))
	},
	{
		id: 'networth.allocation_share',
		label: 'Allocation mix over time',
		kind: 'multiseries',
		scopes: YEARLY,
		build: (data, scope) => netWorthAllocationShare(data, optionalYear(data, scope))
	},
	{
		id: 'networth.allocation_value',
		label: 'Allocation by value',
		kind: 'multiseries',
		scopes: YEARLY,
		build: (data, scope) => netWorthAllocationValue(data, optionalYear(data, scope))
	},
	{
		id: 'networth.accounts',
		label: 'Where the money sits',
		kind: 'categorical',
		scopes: LIFETIME,
		build: (data) => netWorthAccounts(data)
	},
	{
		id: 'networth.saved_vs_other',
		label: 'You vs the market, by year',
		kind: 'multiseries',
		scopes: LIFETIME,
		build: (data) => savedVsOther(data)
	},
	{
		id: 'networth.saved_vs_other_by_month',
		label: 'You vs the market, by month',
		kind: 'multiseries',
		scopes: ['year'],
		build: (data, scope) => savedVsOtherByMonth(data, scopeYear(data, scope))
	},
	// One entry per term, so a KPI card can name the single series it draws behind its figure.
	...(
		[
			['saved', 'Saved'],
			['other', 'Market & other']
		] as const
	).map(([slug, label]): DataDef => ({
		id: `networth.${slug}_by_month`,
		label,
		kind: 'series',
		scopes: ['year'],
		build: (data, scope) => growthByMonth(data, scopeYear(data, scope), slug, label)
	})),
	{
		id: 'networth.year_table',
		label: 'Year by year',
		kind: 'table',
		scopes: LIFETIME,
		build: (data) => netWorthYearTable(data)
	},
	// One entry per field rather than one parameterized entry: a KPI names its series by id.
	{
		id: 'networth.by_year',
		label: 'Net worth',
		kind: 'series',
		scopes: LIFETIME,
		build: (data) => netWorthByYear(data, 'net_worth')
	},
	{
		id: 'networth.assets_by_year',
		label: 'Assets',
		kind: 'series',
		scopes: LIFETIME,
		build: (data) => netWorthByYear(data, 'assets')
	},
	{
		id: 'networth.liabilities_by_year',
		label: 'Liabilities',
		kind: 'series',
		scopes: LIFETIME,
		build: (data) => netWorthByYear(data, 'liabilities')
	},
	// Both units in one entry: the points carry the dollar amount as their alternate reading, so a second
	// near-identical chart is not needed to state it.
	{
		id: 'networth.change_by_month',
		label: 'Net worth & assets change',
		kind: 'multiseries',
		scopes: ['year'],
		build: (data, scope) => netWorthAssetsChange(data, scopeYear(data, scope))
	},
	{
		id: 'networth.liabilities_change',
		label: 'Liabilities change',
		kind: 'multiseries',
		scopes: ['year'],
		build: (data, scope) => liabilitiesChange(data, scopeYear(data, scope))
	},
	{
		id: 'networth.change_by_year',
		label: 'Net worth & assets change',
		kind: 'multiseries',
		scopes: LIFETIME,
		build: (data) => netWorthAssetsChangeByYear(data)
	},
	{
		id: 'networth.liabilities_change_by_year',
		label: 'Liabilities change',
		kind: 'multiseries',
		scopes: LIFETIME,
		build: (data) => liabilitiesChangeByYear(data)
	},
	// The shape of net worth's yearly rate, for the mark behind the compound-growth card.
	{
		id: 'networth.growth_rate_by_year',
		label: 'Growth rate by year',
		kind: 'series',
		scopes: LIFETIME,
		build: (data) => growthRateByYear(data)
	}
];

// --- one measure over time ---
//
// Generated over the same measures the scalars use, so a KPI's chart and its number agree.

/** Measures with a period-by-period trend. Month scope reads as the trailing twelve. */
const TRENDS: Field[] = ['income', 'spending', 'saved'];

/** Measures with a running total. */
const RUNNING: Field[] = ['gross', 'deductions', 'contributions', 'net', 'takehome', 'saved'];

// `running.*` spans the months the measure moved in, so a year-to-date accumulation fills its chart
// rather than flatlining; `revolving.*` spans the trailing twelve, which survives a year boundary.
const SERIES_DEFS: DataDef[] = [
	...TRENDS.map((f): DataDef => ({
		id: `trend.${f}`,
		label: `${measureLabel(f)} over time`,
		kind: 'series',
		scopes: ALL_SCOPES,
		build: (data, scope) =>
			scope.level === 'month'
				? measureTrailing(data, f, scope.monthKey || latestMonthKey(data))
				: measureByMonth(data, f, optionalYear(data, scope))
	})),
	...RUNNING.map((f): DataDef => ({
		id: `running.${f}`,
		label: `${measureLabel(f)}, running total`,
		kind: 'series',
		scopes: YEARLY,
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
		scopes: ALL_SCOPES,
		build: (data, scope) =>
			accumulate(measureTrailing(data, f, scope.monthKey || latestMonthKey(data)))
	}))
];

const NETWORTH_STATS: DataDef[] = [
	...(
		[
			['networth.current', 'Net worth', 'net_worth'],
			['networth.assets', 'Assets', 'assets'],
			['networth.liabilities', 'Liabilities', 'liabilities']
		] as const
	).map(([id, label, field]) =>
		scalarDef(id, label, LIFETIME, (data) => netWorthScalar(data, field, words(label)))
	),
	...(
		[
			['networth.change', 'Net worth', netWorthChange],
			['networth.saved', 'Saved', netWorthSaved],
			['networth.other', 'Market & other', netWorthOther]
		] as const
	).map(([id, label, build]) => scalarDef(id, label, YEARLY, build)),
	...(
		[
			['networth.fi_number', 'FI number', fiNumber],
			['networth.fi_progress', 'FI progress', fiProgress],
			['networth.coast_fi', 'Coast FI', coastFi],
			['networth.years_of_freedom', 'Years of freedom', yearsOfFreedom],
			['networth.runway', 'Liquid runway', liquidRunway],
			['networth.balance_growth', 'Balance growth', balanceGrowth],
			['networth.top_account', 'Top account', topAccountShare]
		] as const
	).map(([id, label, build]) => scalarDef(id, label, LIFETIME, build))
];

// --- the decomposition behind a change in net worth ---
//
// The same three figures the KPI cards carry, re-read as a matrix. At year scope each level is badged
// against last year's; over a lifetime there is no prior lifetime, so the rows are rates instead.

const GROWTH_PARTS: { slug: GrowthPart; label: string }[] = [
	{ slug: 'change', label: 'Change' },
	{ slug: 'saved', label: 'Saved' },
	{ slug: 'other', label: 'Market & other' }
];

/** A column per part: its level, and the rates the matrix rows read it at. */
export const NET_WORTH_GROWTH = GROWTH_PARTS.map((part) => ({
	slug: part.slug,
	total: `networth.growth_${part.slug}`,
	perYear: `avg.networth_${part.slug}_per_year`,
	perMonth: `avg.networth_${part.slug}_per_month`
}));

export type NetWorthGrowthColumn = (typeof NET_WORTH_GROWTH)[number];

const NET_WORTH_GROWTH_DEFS: DataDef[] = GROWTH_PARTS.flatMap((part) => [
	scalarDef(`networth.growth_${part.slug}`, part.label, YEARLY, (data, scope) =>
		netWorthGrowth(data, scope, part.slug, words(part.label))
	),
	scalarDef(
		`avg.networth_${part.slug}_per_year`,
		`Avg ${part.label.toLowerCase()} / year`,
		LIFETIME,
		(data) => netWorthGrowthPerYear(data, part.slug, words(part.label))
	),
	scalarDef(
		`avg.networth_${part.slug}_per_month`,
		`Avg ${part.label.toLowerCase()} / month`,
		YEARLY,
		(data, scope) => netWorthGrowthPerMonth(data, scope, part.slug, words(part.label))
	)
]);

// --- single-figure data (scalar metrics) ---

// `note` is the figure's caption; it lives with the definition so a view can't answer differently.
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
		note: 'saved before take-home'
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
		note: 'of net income'
	},
	{
		id: 'ratio.spending_rate',
		label: 'Spending rate',
		num: 'spending',
		den: 'income',
		note: 'of net income'
	},
	{
		id: 'ratio.deduction_rate',
		label: 'Deduction rate',
		num: 'deductions',
		den: 'gross',
		note: 'of gross withheld'
	}
];

// The measures carrying a run-rate, ordered the way money moves through them. `slug` names the id,
// `label` the display text, and `total` the id of the same measure's level.
const RUN_RATES: {
	slug: string;
	label: string;
	field: Measure;
	total: string;
	signed?: boolean;
}[] = [
	{ slug: 'gross', label: 'gross', field: 'gross', total: 'income.gross' },
	{ slug: 'deductions', label: 'deductions', field: 'deductions', total: 'income.deductions' },
	{
		slug: 'contributions',
		label: 'contributions',
		field: 'contributions',
		total: 'income.contributions'
	},
	{ slug: 'takehome', label: 'take-home', field: 'takehome', total: 'income.takehome' },
	{ slug: 'income', label: 'income', field: 'income', total: 'income.total' },
	{ slug: 'spending', label: 'spent', field: 'spending', total: 'spending.total' },
	{ slug: 'saved', label: 'saved', field: 'saved', total: 'saved.total', signed: true }
];

/** The measures whose year-over-year and month-over-month change is worth a card of its own. */
const CHANGE_FIELDS: Field[] = ['income', 'spending', 'saved'];

/** A column per measure: the ids for its level, its two run-rates, and its change where one exists. */
export const CASH_FLOW_COLUMNS = RUN_RATES.map((r) => ({
	slug: r.slug,
	total: r.total,
	perYear: `avg.${r.slug}_per_year`,
	perMonth: `avg.${r.slug}_per_month`,
	yoy: CHANGE_FIELDS.includes(r.field as Field) ? `change.${r.slug}_yoy` : undefined
}));

export type CashFlowColumn = (typeof CASH_FLOW_COLUMNS)[number];

/** The chain restricted to `slugs`, in the order asked for. Throws on a slug the chain has no column
    for, so a view can't silently render a short table. */
export function cashFlowChain(slugs: string[]): CashFlowColumn[] {
	return slugs.map((slug) => {
		const col = CASH_FLOW_COLUMNS.find((c) => c.slug === slug);
		if (!col) throw new Error(`unknown cash-flow column: ${slug}`);
		return col;
	});
}

/** `avg.<measure>_per_<period>`. A yearly average only means anything over the whole history. */
function runRateDefs(per: 'month' | 'year'): DataDef[] {
	const scopes: ScopeLevel[] = per === 'month' ? ['all', 'year'] : ['all'];
	return RUN_RATES.map((r) => {
		const label = `Avg ${r.label} / ${per}`;
		return scalarDef(`avg.${r.slug}_per_${per}`, label, scopes, (data, scope) => {
			const s = average(data, r.field, per, scope, { label: words(label) });
			return r.signed ? signed(s) : s;
		});
	});
}

const COUNTS: { id: string; label: string; of: Countable }[] = [
	{ id: 'count.transactions', label: 'Transactions', of: 'transactions' },
	{ id: 'count.paychecks', label: 'Paychecks', of: 'paychecks' },
	{ id: 'count.active_months', label: 'Active months', of: 'active_months' },
	{ id: 'count.categories', label: 'Categories', of: 'categories' }
];

const EXTREMA: { id: string; of: ExtremumOf; scopes: ScopeLevel[] }[] = [
	{ id: 'max.category', of: 'category', scopes: ALL_SCOPES },
	{ id: 'max.transaction', of: 'transaction', scopes: ALL_SCOPES },
	{ id: 'max.month', of: 'month', scopes: ['all', 'year'] }
];

// Labelled by the measure alone: the badge's own note says which period it compares against.
const CHANGES: { field: Field; period: 'year' | 'month' }[] = (['year', 'month'] as const).flatMap(
	(period) => CHANGE_FIELDS.map((field) => ({ field, period }))
);

const VS_TYPICAL: DataDef[] = [
	scalarDef('spending.vs_typical', 'vs your average', ['month'], (data, scope) =>
		scope.monthKey
			? vsTypical(data, scope.monthKey, 'spending', { label: words('vs your average') })
			: {
					kind: 'scalar',
					unit: MONEY(data.currency),
					label: words('vs your average'),
					value: null
				}
	)
];

const STAT_DEFS: DataDef[] = [
	...AMOUNTS.map((a) =>
		scalarDef(a.id, a.label, ALL_SCOPES, (data, scope) => {
			const s = amount(data, scope, a.field, {
				label: words(a.label),
				note: a.note ? words(a.note) : undefined
			});
			return a.signed ? signed(s) : s;
		})
	),
	...RATIOS.map((r) =>
		scalarDef(r.id, r.label, ALL_SCOPES, (data, scope) =>
			ratio(data, scope, r.num, r.den, { label: words(r.label), note: words(r.note) })
		)
	),
	...runRateDefs('month'),
	...runRateDefs('year'),
	...COUNTS.map((c) =>
		scalarDef(c.id, c.label, ALL_SCOPES, (data, scope) => count(data, scope, c.of))
	),
	...EXTREMA.map((e) =>
		scalarDef(e.id, extremumLabel('max', e.of), e.scopes, (data, scope) =>
			extremum(data, scope, e.of, 'max')
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
	...NETWORTH_STATS,
	...NET_WORTH_GROWTH_DEFS
];

export const CATALOG_BY_ID: Record<string, DataDef> = Object.fromEntries(
	CATALOG.map((d) => [d.id, d])
);

/** The year-over-year change ids for `cols`, in order. Throws where the chain has no change column. */
export function cashFlowChanges(cols: CashFlowColumn[]): string[] {
	return cols.map((c) => {
		if (!c.yoy) throw new Error(`no year-over-year column for ${c.slug}`);
		return c.yoy;
	});
}

/** A cash-flow column's heading: the catalog's own name for the measure's level. */
export const cashFlowHeading = (c: CashFlowColumn) => CATALOG_BY_ID[c.total]!.label;

/** A net-worth growth column's heading, from the same place, for the same reason. */
export const netWorthGrowthHeading = (c: NetWorthGrowthColumn) => CATALOG_BY_ID[c.total]!.label;

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
// Instances come from the loaded document, so a picker enumerates them per document and scope.

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
