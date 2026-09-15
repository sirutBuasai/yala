// Scope: which slice of the dashboard a data/metric builder reads. Its own module so both the
// primitive catalog and the metric layer can depend on it without importing each other.

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
 * The most recent tracked month as "YYYY-MM", or '' for an untracked ledger. Sorted because the
 * contract doesn't promise `month_keys` in order.
 */
export function latestMonthKey(data: DashboardData): string {
	return [...data.meta.month_keys].sort().at(-1) ?? '';
}

/**
 * The tracked months a figure for `monthKey` is judged against: up to `window` months before it that
 * have data. Empty means there is no norm yet.
 */
export function priorMonths(data: DashboardData, monthKey: string, window = 12): string[] {
	return data.meta.month_keys.filter((k) => k < monthKey && data.months[k]).slice(-window);
}

/**
 * The most recent date anything is logged on, as ISO "YYYY-MM-DD", or '' for an empty ledger. A new
 * entry defaults to this rather than today, since a week of spending is logged in one sitting.
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
