// Scope: which slice of the dashboard a data/metric builder reads. Its own module so both the
// primitive catalog and the metric layer can depend on it without importing each other.

import type { DashboardData } from '$lib/data/types';
import { yearOf } from '$lib/utils/period';

export type ScopeLevel = 'all' | 'year' | 'month';

export interface Scope {
	level: ScopeLevel;
	year?: number;
	monthKey?: string;
	/** At `all`, the first year the record is read from: a trailing window rather than the lifetime. */
	since?: number;
}

/** Whether `year` falls inside an `all` scope's window. Only meaningful at `all`. */
export const inWindow = (scope: Scope, year: number): boolean =>
	scope.since == null || year >= scope.since;

/** The most recent tracked year, or the current calendar year when none are tracked. */
export function latestYear(data: DashboardData): number {
	const ys = data.meta.years;
	return ys[ys.length - 1] ?? new Date().getFullYear();
}

/** '' for an untracked ledger. Sorted, since the contract doesn't order `month_keys`. */
export function latestMonthKey(data: DashboardData): string {
	return [...data.meta.month_keys].sort().at(-1) ?? '';
}

/** Up to `window` earlier months with data; empty means no norm yet. */
export function priorMonths(data: DashboardData, monthKey: string, window = 12): string[] {
	return data.meta.month_keys.filter((k) => k < monthKey && data.months[k]).slice(-window);
}

/** ISO date, or '' for an empty ledger. New entries default here, since spending is logged in batches. */
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
	return scope.year ?? (scope.monthKey ? yearOf(scope.monthKey) : latestYear(data));
}

/** A stable string key for a scope — used to memoize per-scope computations. */
export function scopeKey(scope: Scope): string {
	return `${scope.level}:${scope.year ?? ''}:${scope.monthKey ?? ''}:${scope.since ?? ''}`;
}
