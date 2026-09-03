// Scalar metrics: a small set of parameterized builders that turn the dashboard
// document into single-figure `Scalar` primitives (raw amounts, averages, ratios,
// counts, extrema, period-over-period change). No colours or formatting here — the
// unit drives rendering in the visualization layer. Per-scope aggregates are memoized
// per DashboardData so many metrics over one document don't recompute the same sums.

import type { DashboardData, MonthPage, PaycheckOut, Txn } from '$lib/data/types';
import type { Scalar } from './primitives';
import { MONEY, PERCENT, COUNT } from './primitives';
import { money } from '$lib/utils/format';
import { sumValues } from '$lib/utils/num';
import { addMonths } from '$lib/utils/period';
import { type Scope, latestYear, scopeYear, scopeKey } from './scope';

// --- measures: what a metric reads ---

/** An aggregate figure available at any scope. */
export type Field =
	'income' | 'spending' | 'saved' | 'gross' | 'deductions' | 'contributions' | 'net' | 'takehome';

/** A single line item inside a paycheck's deductions or contributions map (e.g. Tax, 401k). */
export interface Component {
	group: 'deductions' | 'contributions';
	key: string;
}

export type Measure = Field | Component;

const FIELD_LABEL: Record<Field, string> = {
	income: 'Income',
	spending: 'Spending',
	saved: 'Saved',
	gross: 'Gross',
	deductions: 'Deductions',
	contributions: 'Contributions',
	net: 'Net',
	takehome: 'Take-home'
};

function measureLabel(m: Measure): string {
	return typeof m === 'string' ? FIELD_LABEL[m] : m.key;
}

// --- per-document, per-scope memoization ---

const CACHE = new WeakMap<DashboardData, Map<string, unknown>>();

function memo<T>(data: DashboardData, key: string, compute: () => T): T {
	let m = CACHE.get(data);
	if (!m) {
		m = new Map();
		CACHE.set(data, m);
	}
	if (m.has(key)) return m.get(key) as T;
	const value = compute();
	m.set(key, value);
	return value;
}

// --- scope collections ---

/** The month pages a scope covers: one month, a year's months, or all of them. */
function monthsInScope(data: DashboardData, scope: Scope): [string, MonthPage][] {
	return memo(data, `mon:${scopeKey(scope)}`, () => {
		if (scope.level === 'month') {
			const md = scope.monthKey ? data.months[scope.monthKey] : undefined;
			return md && scope.monthKey ? [[scope.monthKey, md]] : [];
		}
		const prefix = scope.level === 'year' ? `${scopeYear(data, scope)}-` : '';
		return Object.entries(data.months).filter(([k]) => !prefix || k.startsWith(prefix));
	});
}

function scopePaychecks(data: DashboardData, scope: Scope): PaycheckOut[] {
	return monthsInScope(data, scope).flatMap(([, md]) => md.paychecks);
}

function scopeTxns(data: DashboardData, scope: Scope): Txn[] {
	return monthsInScope(data, scope).flatMap(([, md]) => md.transactions);
}

// --- aggregate totals ---

type Totals = Record<Field, number>;

function totals(data: DashboardData, scope: Scope): Totals {
	return memo(data, `tot:${scopeKey(scope)}`, () => {
		let income = 0;
		let spending = 0;
		let saved = 0;
		if (scope.level === 'all') {
			for (const r of data.overview.by_year) {
				income += r.income;
				spending += r.spent;
				saved += r.saved;
			}
		} else if (scope.level === 'year') {
			const r = data.overview.by_year.find((x) => x.year === scopeYear(data, scope));
			income = r?.income ?? 0;
			spending = r?.spent ?? 0;
			saved = r?.saved ?? 0;
		} else {
			const md = scope.monthKey ? data.months[scope.monthKey] : undefined;
			income = md?.total_income ?? 0;
			spending = md?.total_spent ?? 0;
			saved = income - spending;
		}

		let gross = 0;
		let deductions = 0;
		let contributions = 0;
		let net = 0;
		let takehome = 0;
		if (scope.level === 'all') {
			for (const r of data.income.by_year) {
				gross += r.gross;
				deductions += r.deductions;
				contributions += r.contributions;
				net += r.net;
				takehome += r.take_home;
			}
		} else if (scope.level === 'year') {
			const r = data.income.by_year.find((x) => x.year === scopeYear(data, scope));
			gross = r?.gross ?? 0;
			deductions = r?.deductions ?? 0;
			contributions = r?.contributions ?? 0;
			net = r?.net ?? 0;
			takehome = r?.take_home ?? 0;
		} else {
			// Month scope has no annual income row — aggregate the month's paychecks.
			for (const p of scopePaychecks(data, scope)) {
				gross += p.gross;
				net += p.net;
				takehome += p.take_home;
				deductions += sumValues(p.deductions);
				contributions += sumValues(p.contributions);
			}
		}

		return { income, spending, saved, gross, deductions, contributions, net, takehome };
	});
}

/** Active-month counts within a year: months with income, with spending, or either. */
function activeMonths(
	data: DashboardData,
	year: number
): { income: number; spend: number; any: number } {
	return memo(data, `act:${year}`, () => {
		const rows = data.years[String(year)]?.matrix ?? [];
		return {
			income: rows.filter((r) => r.income > 0).length,
			spend: rows.filter((r) => sumValues(r.spent) > 0).length,
			any: rows.filter((r) => r.income > 0 || sumValues(r.spent) > 0).length
		};
	});
}

function categorySpend(data: DashboardData, scope: Scope, category: string): number {
	if (scope.level === 'month') {
		const items = scope.monthKey ? (data.months[scope.monthKey]?.by_category ?? []) : [];
		return items.filter((c) => c.category === category).reduce((a, c) => a + c.amount, 0);
	}
	if (scope.level === 'year') {
		const yd = data.years[String(scopeYear(data, scope))];
		return yd ? yd.matrix.reduce((s, row) => s + (row.spent[category] ?? 0), 0) : 0;
	}
	return data.overview.all_time_by_category
		.filter((c) => c.category === category)
		.reduce((a, c) => a + c.amount, 0);
}

/** Resolve any measure to a raw number at a scope. */
function measureValue(data: DashboardData, scope: Scope, m: Measure): number {
	if (typeof m === 'string') return totals(data, scope)[m];
	return scopePaychecks(data, scope).reduce(
		(a, p) => a + ((m.group === 'deductions' ? p.deductions : p.contributions)[m.key] ?? 0),
		0
	);
}

/** Distinct deduction / contribution line-item keys present in a scope's paychecks. */
export function componentKeys(
	data: DashboardData,
	scope: Scope
): { deductions: string[]; contributions: string[] } {
	const ded = new Set<string>();
	const con = new Set<string>();
	for (const p of scopePaychecks(data, scope)) {
		for (const k of Object.keys(p.deductions)) ded.add(k);
		for (const k of Object.keys(p.contributions)) con.add(k);
	}
	return { deductions: [...ded], contributions: [...con] };
}

// --- shared option shape ---

interface Opts {
	label?: string;
	note?: string;
	dir?: 'up' | 'down';
}

/** Tag a scalar's direction from its own sign — green when ≥ 0, red when negative. */
export function signed(s: Scalar): Scalar {
	return { ...s, dir: (s.value ?? 0) >= 0 ? 'up' : 'down' };
}

// --- builders ---

/** A money figure for a measure at a scope. */
export function amount(data: DashboardData, scope: Scope, m: Measure, opts: Opts = {}): Scalar {
	return {
		kind: 'scalar',
		unit: MONEY(data.currency),
		label: opts.label ?? measureLabel(m),
		value: measureValue(data, scope, m),
		dir: opts.dir,
		note: opts.note
	};
}

/**
 * Average of a measure over a period. `per: 'year'` divides the lifetime total by the
 * number of tracked years; `per: 'month'` divides a year's total by that year's ACTIVE
 * months (income-active for income, spend-active for spending, either otherwise) — never
 * a flat 12, so a partial year isn't understated.
 */
export function average(
	data: DashboardData,
	m: Measure,
	per: 'year' | 'month',
	year?: number,
	opts: Opts = {}
): Scalar {
	const unit = MONEY(data.currency);
	const name = measureLabel(m).toLowerCase();

	if (per === 'year') {
		const years = data.overview.by_year.length || 1;
		return {
			kind: 'scalar',
			unit,
			label: opts.label ?? `Avg ${name} / year`,
			value: measureValue(data, { level: 'all' }, m) / years,
			dir: opts.dir,
			note: opts.note ?? `${years} tracked years`
		};
	}

	const y = year ?? latestYear(data);
	const active = activeMonths(data, y);
	const divisor =
		(typeof m === 'string' && m === 'spending'
			? active.spend
			: typeof m === 'string' && m === 'income'
				? active.income
				: active.any) || 1;
	return {
		kind: 'scalar',
		unit,
		label: opts.label ?? `Avg ${name} / month`,
		value: measureValue(data, { level: 'year', year: y }, m) / divisor,
		dir: opts.dir,
		note: opts.note ?? `${divisor} active months`
	};
}

/** A percentage of one measure over another at a scope; `null` (em dash) when the base is 0. */
export function ratio(
	data: DashboardData,
	scope: Scope,
	num: Measure,
	den: Measure,
	opts: Opts = {}
): Scalar {
	const n = measureValue(data, scope, num);
	const d = measureValue(data, scope, den);
	return {
		kind: 'scalar',
		unit: PERCENT,
		label: opts.label ?? `${measureLabel(num)} / ${measureLabel(den)}`,
		value: d ? (n / d) * 100 : null,
		dir: opts.dir,
		note: opts.note
	};
}

/** Money spent in a single category at a scope. */
export function categoryAmount(
	data: DashboardData,
	scope: Scope,
	category: string,
	opts: Opts = {}
): Scalar {
	return {
		kind: 'scalar',
		unit: MONEY(data.currency),
		label: opts.label ?? category,
		value: categorySpend(data, scope, category),
		dir: opts.dir,
		note: opts.note
	};
}

/** A category's share of total spending or income at a scope, as a percentage. */
export function categoryShare(
	data: DashboardData,
	scope: Scope,
	category: string,
	of: 'spending' | 'income',
	opts: Opts = {}
): Scalar {
	const whole = totals(data, scope)[of];
	return {
		kind: 'scalar',
		unit: PERCENT,
		label: opts.label ?? `${category} share`,
		value: whole ? (categorySpend(data, scope, category) / whole) * 100 : null,
		dir: opts.dir,
		note: opts.note ?? `of ${of}`
	};
}

export type Countable = 'transactions' | 'paychecks' | 'active_months' | 'categories';

const COUNT_LABEL: Record<Countable, string> = {
	transactions: 'Transactions',
	paychecks: 'Paychecks',
	active_months: 'Active months',
	categories: 'Categories'
};

function countValue(data: DashboardData, scope: Scope, of: Countable): number {
	switch (of) {
		case 'transactions':
			return scopeTxns(data, scope).length;
		case 'paychecks':
			return scopePaychecks(data, scope).length;
		case 'active_months':
			return monthsInScope(data, scope).filter(
				([, md]) => md.total_income > 0 || md.total_spent > 0
			).length;
		case 'categories': {
			const seen = new Set<string>();
			for (const c of data.meta.categories) {
				if (categorySpend(data, scope, c) > 0) seen.add(c);
			}
			return seen.size;
		}
	}
}

/** A count of things in a scope (transactions, paychecks, active months, categories). */
export function count(data: DashboardData, scope: Scope, of: Countable, opts: Opts = {}): Scalar {
	return {
		kind: 'scalar',
		unit: COUNT,
		label: opts.label ?? COUNT_LABEL[of],
		value: countValue(data, scope, of),
		dir: opts.dir,
		note: opts.note
	};
}

export type ExtremumOf = 'transaction' | 'category' | 'month';

/** The largest or smallest transaction, category spend, or month spend in a scope; the
 *  winner's name lands in the note. */
export function extremum(
	data: DashboardData,
	scope: Scope,
	of: ExtremumOf,
	mode: 'max' | 'min',
	opts: Opts = {}
): Scalar {
	const pick = <T>(items: T[], value: (t: T) => number): T | undefined =>
		items.reduce<T | undefined>((best, it) => {
			if (best === undefined) return it;
			const cmp = value(it) - value(best);
			return (mode === 'max' ? cmp > 0 : cmp < 0) ? it : best;
		}, undefined);

	let value: number | null = null;
	let name = '';
	if (of === 'transaction') {
		const t = pick(scopeTxns(data, scope), (x) => x.amount);
		if (t) {
			value = t.amount;
			name = t.payee || t.category;
		}
	} else if (of === 'category') {
		const withSpend = data.meta.categories.map((c) => ({ c, v: categorySpend(data, scope, c) }));
		const top = pick(
			withSpend.filter((x) => x.v > 0),
			(x) => x.v
		);
		if (top) {
			value = top.v;
			name = top.c;
		}
	} else {
		const top = pick(monthsInScope(data, scope), ([, md]) => md.total_spent);
		if (top) {
			value = top[1].total_spent;
			name = top[0];
		}
	}

	const verb = mode === 'max' ? 'Largest' : 'Smallest';
	return {
		kind: 'scalar',
		unit: MONEY(data.currency),
		label: opts.label ?? `${verb} ${of}`,
		value,
		dir: opts.dir,
		note: opts.note ?? name
	};
}

/**
 * A measure with its period-over-period change as a `delta`. `period: 'year'` compares
 * against the prior year (`at` = a year, default latest); `period: 'month'` against the
 * prior month (`at` = a "YYYY-MM" key). The delta is a percentage; it's omitted when the
 * prior period is 0 (no meaningful ratio).
 */
/**
 * How far a month sits from its own recent norm: the measure this month minus the average of the
 * prior `window` months that have data. Answers "is this month normal?", which neither the raw
 * total nor a month-over-month delta does — one noisy previous month makes MoM meaningless, while
 * a trailing average is stable. `null` when there's no history to form a norm from.
 *
 * Direction is spending-shaped by default (over the norm reads as bad); pass `higherIsBetter` for
 * measures like income where exceeding the norm is good.
 */
export function vsTypical(
	data: DashboardData,
	monthKey: string,
	m: Measure,
	opts: Opts & { window?: number; higherIsBetter?: boolean } = {}
): Scalar {
	const window = opts.window ?? 12;
	const prior = data.meta.month_keys.filter((k) => k < monthKey && data.months[k]).slice(-window);
	const label = opts.label ?? measureLabel(m);
	if (!prior.length) {
		return { kind: 'scalar', unit: MONEY(data.currency), label, value: null, note: opts.note };
	}

	const avg =
		prior.reduce((a, k) => a + measureValue(data, { level: 'month', monthKey: k }, m), 0) /
		prior.length;
	const delta = measureValue(data, { level: 'month', monthKey }, m) - avg;
	const better = opts.higherIsBetter ? delta >= 0 : delta <= 0;

	return {
		kind: 'scalar',
		unit: MONEY(data.currency),
		label,
		value: delta,
		dir: better ? 'up' : 'down',
		note: opts.note ?? `vs your ${money(avg)} / mo average`
	};
}

export function change(
	data: DashboardData,
	m: Measure,
	period: 'year' | 'month',
	at?: number | string,
	opts: Opts = {}
): Scalar {
	let cur: Scope;
	let prev: Scope;
	if (period === 'year') {
		const y = typeof at === 'number' ? at : latestYear(data);
		cur = { level: 'year', year: y };
		prev = { level: 'year', year: y - 1 };
	} else {
		const key =
			typeof at === 'string' ? at : (data.meta.month_keys[data.meta.month_keys.length - 1] ?? '');
		cur = { level: 'month', monthKey: key };
		prev = { level: 'month', monthKey: addMonths(key, -1) };
	}

	const now = measureValue(data, cur, m);
	const before = measureValue(data, prev, m);
	const pct = before ? ((now - before) / before) * 100 : null;

	return {
		kind: 'scalar',
		unit: MONEY(data.currency),
		label: opts.label ?? measureLabel(m),
		value: now,
		delta:
			pct === null
				? undefined
				: {
						value: pct,
						unit: PERCENT,
						dir: now >= before ? 'up' : 'down',
						note: opts.note ?? (period === 'year' ? 'YoY' : 'MoM')
					}
	};
}
