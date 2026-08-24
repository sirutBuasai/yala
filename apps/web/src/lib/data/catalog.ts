// The data catalog: the registry of named, bindable data instances. Each entry
// knows what primitive KIND it produces and at which scopes, and builds a concrete
// primitive from the dashboard document. This is what a "pick your data" UI reads;
// the chart registry then answers "which charts can draw this kind?".

import type { DashboardData } from '$lib/data/types';
import type { Primitive, PrimitiveKind } from './primitives';
import { MONEY } from './primitives';
import { categorical, whereItWent } from './categorical';
import {
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

export type ScopeLevel = 'all' | 'year' | 'month';

export interface Scope {
	level: ScopeLevel;
	year?: number;
	monthKey?: string;
}

export interface DataDef {
	id: string;
	label: string;
	kind: PrimitiveKind;
	/** Scope levels this data supports. */
	scopes: ScopeLevel[];
	build(data: DashboardData, scope: Scope): Primitive;
}

// --- scope helpers ---

function latestYear(data: DashboardData): number {
	const ys = data.meta.years;
	return ys[ys.length - 1] ?? new Date().getFullYear();
}

function scopeYear(data: DashboardData, scope: Scope): number {
	return scope.year ?? latestYear(data);
}

// --- the catalog ---

export const CATALOG: DataDef[] = [
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
		scopes: ['all'],
		build: (data) => moneyFlow(data)
	}
];

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
