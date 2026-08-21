// Series catalog: the registry of widget-bindable series.
//
// Every series derives from the canonical `overview` / `years` / `months` /
// `income` sections — the contract carries no precomputed series. Each entry
// declares its normalized shape so the UI knows which chart types apply.

import type { DashboardData } from './types';
import { MONTHS, monthLabel } from './format';

export type Shape = 'categorical' | 'time' | 'matrix' | 'table';
export type ScopeLevel = 'all' | 'year' | 'month';
export type Page = 'spending' | 'income';

export interface Scope {
	level: ScopeLevel;
	year?: number;
	monthKey?: string;
}

export type NormalizedSeries =
	| { shape: 'categorical'; data: { key: string; value: number }[] }
	| { shape: 'time'; data: { label: string; value: number }[] }
	| { shape: 'matrix'; rows: string[]; cols: string[]; values: number[][] }
	| { shape: 'table'; columns: string[]; rows: (string | number)[][] };

export interface SeriesDef {
	id: string;
	label: string;
	shape: Shape;
	scopes: ScopeLevel[];
	extract(data: DashboardData, scope: Scope): NormalizedSeries;
}

// --- scope helpers ---

function latestYear(data: DashboardData): number {
	const years = data.meta.years;
	return years.length ? years[years.length - 1] : new Date().getFullYear();
}

function scopeYear(data: DashboardData, scope: Scope): number {
	return scope.year ?? latestYear(data);
}

function monthsForYear(data: DashboardData, year: number): string[] {
	return data.meta.month_keys.filter((m) => m.startsWith(String(year)));
}

// --- extraction helpers over the canonical sections ---

/** Category totals for a year, summing each month row's spent-by-category vector. */
function yearCategoryTotals(data: DashboardData, year: number): { key: string; value: number }[] {
	const yd = data.years[String(year)];
	const cats = data.meta.categories;
	if (!yd) return [];
	return cats.map((c) => ({
		key: c,
		value: yd.matrix.reduce((sum, row) => sum + (row.spent[c] ?? 0), 0)
	}));
}

/** Total spent per calendar month (index 0..11) for a year. */
function yearMonthlySpent(data: DashboardData, year: number): number[] {
	const yd = data.years[String(year)];
	if (!yd) return new Array(12).fill(0);
	return yd.matrix.map((row) => Object.values(row.spent).reduce((a, b) => a + b, 0));
}

// --- the catalog ---

export const SERIES: SeriesDef[] = [
	{
		id: 'spending.by_category',
		label: 'Spending by category',
		shape: 'categorical',
		scopes: ['all', 'year', 'month'],
		extract(data, scope) {
			if (scope.level === 'month' && scope.monthKey) {
				const md = data.months[scope.monthKey];
				return {
					shape: 'categorical',
					data: (md?.by_category ?? []).map((c) => ({ key: c.category, value: c.amount }))
				};
			}
			if (scope.level === 'year') {
				return { shape: 'categorical', data: yearCategoryTotals(data, scopeYear(data, scope)) };
			}
			return {
				shape: 'categorical',
				data: data.overview.all_time_by_category.map((c) => ({ key: c.category, value: c.amount }))
			};
		}
	},
	{
		id: 'spending.by_month',
		label: 'Spending by month',
		shape: 'time',
		scopes: ['all', 'year'],
		extract(data, scope) {
			if (scope.level === 'all') {
				return {
					shape: 'time',
					data: data.meta.month_keys.map((k) => ({
						label: k,
						value: data.months[k]?.total_spent ?? 0
					}))
				};
			}
			const spent = yearMonthlySpent(data, scopeYear(data, scope));
			return { shape: 'time', data: MONTHS.map((m, i) => ({ label: m, value: spent[i] || 0 })) };
		}
	},
	{
		id: 'spending.by_year',
		label: 'Spending by year',
		shape: 'time',
		scopes: ['all'],
		extract(data) {
			return {
				shape: 'time',
				data: data.overview.by_year.map((y) => ({ label: String(y.year), value: y.spent }))
			};
		}
	},
	{
		id: 'spending.category_by_month',
		label: 'Category by month',
		shape: 'matrix',
		scopes: ['year'],
		extract(data, scope) {
			const yd = data.years[String(scopeYear(data, scope))];
			const cats = data.meta.categories;
			const values = cats.map((c) => MONTHS.map((_, mi) => yd?.matrix[mi]?.spent[c] ?? 0));
			return { shape: 'matrix', rows: cats, cols: MONTHS, values };
		}
	},
	{
		id: 'income.by_month',
		label: 'Income by month',
		shape: 'time',
		scopes: ['all', 'year'],
		extract(data, scope) {
			if (scope.level === 'all') {
				return {
					shape: 'time',
					data: data.meta.month_keys.map((k) => ({
						label: k,
						value: data.months[k]?.total_income ?? 0
					}))
				};
			}
			const byMonth = data.income.by_month[String(scopeYear(data, scope))] ?? new Array(12).fill(0);
			return { shape: 'time', data: MONTHS.map((m, i) => ({ label: m, value: byMonth[i] || 0 })) };
		}
	},
	{
		id: 'income.by_year',
		label: 'Income by year',
		shape: 'time',
		scopes: ['all'],
		extract(data) {
			return {
				shape: 'time',
				data: data.income.by_year.map((y) => ({ label: String(y.year), value: y.gross }))
			};
		}
	},
	{
		id: 'income.paychecks',
		label: 'Paychecks',
		shape: 'table',
		scopes: ['all', 'year', 'month'],
		extract(data, scope) {
			let paychecks = data.income.recent_paychecks;
			if (scope.level === 'month' && scope.monthKey) {
				paychecks = data.months[scope.monthKey]?.paychecks ?? [];
			} else if (scope.level === 'year') {
				const prefix = String(scopeYear(data, scope));
				paychecks = paychecks.filter((p) => p.date.startsWith(prefix));
			}
			const sumValues = (m: Record<string, number>) => Object.values(m).reduce((a, b) => a + b, 0);
			return {
				shape: 'table',
				columns: ['Date', 'Gross', 'Deductions', 'Contributions', 'Net', 'Take-home'],
				rows: paychecks.map((p) => [
					p.date,
					p.gross,
					sumValues(p.deductions),
					sumValues(p.contributions),
					p.net,
					p.take_home
				])
			};
		}
	}
];

export const SERIES_BY_ID: Record<string, SeriesDef> = Object.fromEntries(
	SERIES.map((s) => [s.id, s])
);

/** Series relevant to a page tab, used to populate widget pickers. */
export function seriesForPage(page: 'spending' | 'income'): SeriesDef[] {
	return SERIES.filter((s) => s.id.startsWith(page + '.'));
}

export { monthLabel };
