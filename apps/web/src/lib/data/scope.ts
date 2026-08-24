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

/** The year a scope targets, defaulting to the latest tracked year. */
export function scopeYear(data: DashboardData, scope: Scope): number {
	return scope.year ?? latestYear(data);
}

/** A stable string key for a scope — used to memoize per-scope computations. */
export function scopeKey(scope: Scope): string {
	return `${scope.level}:${scope.year ?? ''}:${scope.monthKey ?? ''}`;
}
