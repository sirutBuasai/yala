// Scope: which slice of the dashboard a data/metric builder reads — everything
// ('all'), one year, or one month. Kept in its own module so both the primitive
// catalog and the metric layer can depend on it without importing each other.

import type { DashboardData } from '$lib/data/types';

export type ScopeLevel = 'all' | 'year' | 'month';

export interface Scope {
	level: ScopeLevel;
	year?: number;
	monthKey?: string;
}

/** The most recent tracked year, or the current calendar year when none are tracked. */
export function latestYear(data: DashboardData): number {
	const ys = data.meta.years;
	return ys[ys.length - 1] ?? new Date().getFullYear();
}

/**
 * The most recent tracked month as "YYYY-MM", or '' for an untracked ledger. What a month-scoped
 * view opens on the first time it is ever used. Sorted defensively: the contract doesn't promise an
 * order, and picking the wrong end here would silently strand a view on the oldest month.
 */
export function latestMonthKey(data: DashboardData): string {
	return [...data.meta.month_keys].sort().at(-1) ?? '';
}

/**
 * The most recent date anything is logged on, as ISO "YYYY-MM-DD", or '' for an empty ledger.
 *
 * This is the honest default for a new entry's date. Today is not: you log a week of spending on a
 * Sunday, so "today" is nearly always wrong and re-picking the date was the first thing every add
 * needed. Reads only the latest month with data, since nothing earlier can be the maximum.
 */
export function latestEntryDate(data: DashboardData): string {
	const keys = data.meta.month_keys.filter((k) => data.months[k]);
	const md = data.months[keys[keys.length - 1] ?? ''];
	if (!md) return '';

	const dates = [
		...md.transactions.map((t) => t.date),
		...md.paychecks.map((p) => p.date),
		...(md.transfers ?? []).map((t) => t.date)
	];
	return dates.reduce((latest, d) => (d > latest ? d : latest), '');
}

/** The year a scope targets, defaulting to the latest tracked year. */
export function scopeYear(data: DashboardData, scope: Scope): number {
	return scope.year ?? latestYear(data);
}

/** A stable string key for a scope — used to memoize per-scope computations. */
export function scopeKey(scope: Scope): string {
	return `${scope.level}:${scope.year ?? ''}:${scope.monthKey ?? ''}`;
}
