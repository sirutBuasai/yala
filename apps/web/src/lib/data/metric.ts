// Scalar metrics: parameterized builders that turn the dashboard document into single-figure
// `Scalar` primitives (amounts, averages, ratios, counts, extrema, period-over-period change).
// Per-scope aggregates are memoized per DashboardData so many metrics over one document don't
// recompute the same sums.

import type { DashboardData, MonthPage, PaycheckOut, Txn } from '$lib/data/types';
import type { Scalar, Tone } from './primitives';
import { MONEY, PERCENT, COUNT } from './primitives';
import { money } from '$lib/utils/format';
import { sumValues } from '$lib/utils/num';
import { addMonths } from '$lib/utils/period';
import { type Scope, latestYear, priorMonths, scopeYear, scopeKey } from './scope';
import { labelText, live, words, type Label } from '$lib/ui/label';

// --- measures ---

/** An aggregate figure available at any scope. */
export type Field =
	'income' | 'spending' | 'saved' | 'gross' | 'deductions' | 'contributions' | 'net' | 'takehome';

/** A single line item inside a paycheck's deductions or contributions map. */
export interface Component {
	group: 'deductions' | 'contributions';
	key: string;
}

export type Measure = Field | Component;

const FIELD_LABEL: Record<Field, string> = {
	income: 'Income',
	spending: 'Spent',
	saved: 'Saved',
	gross: 'Gross',
	deductions: 'Deductions',
	contributions: 'Contributions',
	net: 'Net income',
	takehome: 'Take-home'
};

/** A measure's display name. Exported so a series built from a measure is named the same thing. */
export function measureLabel(m: Measure): string {
	return typeof m === 'string' ? FIELD_LABEL[m] : m.key;
}

/** Does a bigger number read as good news? Only spending and deductions go the other way. */
const GOOD_UP: Record<Field, boolean> = {
	income: true,
	spending: false,
	saved: true,
	gross: true,
	deductions: false,
	contributions: true,
	net: true,
	takehome: true
};

function goodUp(m: Measure): boolean {
	return typeof m === 'string' ? GOOD_UP[m] : m.group === 'contributions';
}

/** Good or bad NEWS, never merely positive. Standing still is neither: a figure that did not move has
    no verdict to report. */
export function toneOf(m: Measure, delta: number): Tone | undefined {
	if (delta === 0) return undefined;
	return delta > 0 === goodUp(m) ? 'good' : 'bad';
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

/** The yearly rows a non-month scope covers: all of them, or just the scope's year. */
function yearRows<R extends { year: number }>(rows: R[], data: DashboardData, scope: Scope): R[] {
	return scope.level === 'all' ? rows : rows.filter((r) => r.year === scopeYear(data, scope));
}

function totals(data: DashboardData, scope: Scope): Totals {
	return memo(data, `tot:${scopeKey(scope)}`, () => {
		const t: Totals = {
			income: 0,
			spending: 0,
			saved: 0,
			gross: 0,
			deductions: 0,
			contributions: 0,
			net: 0,
			takehome: 0
		};

		if (scope.level === 'month') {
			const md = scope.monthKey ? data.months[scope.monthKey] : undefined;
			t.income = md?.total_income ?? 0;
			t.spending = md?.total_spent ?? 0;
			t.saved = t.income - t.spending;
			// A month has no annual income row, so aggregate its paychecks.
			for (const p of scopePaychecks(data, scope)) {
				t.gross += p.gross;
				t.net += p.net;
				t.takehome += p.take_home;
				t.deductions += sumValues(p.deductions);
				t.contributions += sumValues(p.contributions);
			}
			return t;
		}

		for (const r of yearRows(data.overview.by_year, data, scope)) {
			t.income += r.income;
			t.spending += r.spent;
			t.saved += r.saved;
		}
		for (const r of yearRows(data.income.by_year, data, scope)) {
			t.gross += r.gross;
			t.deductions += r.deductions;
			t.contributions += r.contributions;
			t.net += r.net;
			t.takehome += r.take_home;
		}

		return t;
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

/**
 * Resolve any measure to a raw number at a scope. Exported so the net-worth metrics can read the
 * same aggregates rather than recomputing them and losing this module's memoization.
 */
export function measureValue(data: DashboardData, scope: Scope, m: Measure): number {
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

interface Opts {
	label?: Label;
	note?: Label;
}

/** Tone a figure whose SIGN is its meaning: a balance that went negative is bad news, and one that
    came out at exactly zero is neither. */
export function signed(s: Scalar): Scalar {
	const v = s.value ?? 0;
	return { ...s, tone: v === 0 ? undefined : v > 0 ? 'good' : 'bad' };
}

// --- builders ---

/** A money figure for a measure at a scope. */
export function amount(data: DashboardData, scope: Scope, m: Measure, opts: Opts = {}): Scalar {
	return {
		kind: 'scalar',
		unit: MONEY(data.currency),
		label: opts.label ?? words(measureLabel(m)),
		value: measureValue(data, scope, m),
		note: opts.note
	};
}

/**
 * The badge a figure carries beside its value. Absent when the base is 0 — there is no percentage to
 * report against nothing, and an untracked earlier period reads as 0.
 */
function deltaOf(m: Measure, now: number, before: number, note: string): Scalar['delta'] {
	// Divided by the MAGNITUDE of the base: `saved` can be negative, and dividing by a negative base
	// flips the percentage's sign away from the direction the figure actually moved.
	if (!before) return undefined;
	return {
		value: ((now - before) / Math.abs(before)) * 100,
		unit: PERCENT,
		tone: toneOf(m, now - before),
		note
	};
}

/** A year's run-rate for a measure, and the ACTIVE months it divided by. */
function perMonth(
	data: DashboardData,
	m: Measure,
	year: number
): { rate: number; divisor: number } {
	const active = activeMonths(data, year);
	const divisor =
		(m === 'spending' ? active.spend : m === 'income' ? active.income : active.any) || 1;
	return { rate: measureValue(data, { level: 'year', year }, m) / divisor, divisor };
}

/**
 * Average of a measure. `per: 'year'` divides the lifetime total by the number of tracked years;
 * `per: 'month'` divides a year's total by that year's ACTIVE months — never a flat 12, so a partial
 * year isn't understated.
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
			label: opts.label ?? words(`Avg ${name} / year`),
			value: measureValue(data, { level: 'all' }, m) / years,
			note: opts.note ?? live(`${years} tracked years`)
		};
	}

	const y = year ?? latestYear(data);
	const now = perMonth(data, m, y);
	return {
		kind: 'scalar',
		unit,
		label: opts.label ?? words(`Avg ${name} / month`),
		value: now.rate,
		// Rate against rate, never this year's rate against last year's total: the two divide by their
		// own active-month counts, and only the rates say whether the pace itself moved.
		delta: deltaOf(m, now.rate, perMonth(data, m, y - 1).rate, 'YoY'),
		note: opts.note ?? live(`${now.divisor} active months`)
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
		label: opts.label ?? words(`${measureLabel(num)} / ${measureLabel(den)}`),
		value: d ? (n / d) * 100 : null,
		note: opts.note
	};
}

export function categoryAmount(
	data: DashboardData,
	scope: Scope,
	category: string,
	opts: Opts = {}
): Scalar {
	return {
		kind: 'scalar',
		unit: MONEY(data.currency),
		label: opts.label ?? words(category),
		value: categorySpend(data, scope, category),
		note: opts.note
	};
}

/** A category's share of spending or income at a scope, as a percentage. */
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
		label: opts.label ?? words(`${category} share`),
		value: whole ? (categorySpend(data, scope, category) / whole) * 100 : null,
		note: opts.note ?? words(`of ${of}`)
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

export function count(data: DashboardData, scope: Scope, of: Countable, opts: Opts = {}): Scalar {
	return {
		kind: 'scalar',
		unit: COUNT,
		label: opts.label ?? words(COUNT_LABEL[of]),
		value: countValue(data, scope, of),
		note: opts.note
	};
}

export type ExtremumOf = 'transaction' | 'category' | 'month';

/** How an extremum names itself, shared with the catalog so the two can't drift. */
export const extremumLabel = (mode: 'max' | 'min', of: ExtremumOf) =>
	`${mode === 'max' ? 'Largest' : 'Smallest'} ${of}`;

/** The largest or smallest transaction, category spend, or month spend in a scope; the winner's
 *  name lands in the note. */
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

	return {
		kind: 'scalar',
		unit: MONEY(data.currency),
		label: opts.label ?? words(extremumLabel(mode, of)),
		value,
		// Read off the data: a rename must not be able to freeze the winner's name.
		note: opts.note ?? live(name)
	};
}

/**
 * How far a month sits from its own recent norm: this month minus the average of the prior `window`
 * months with data — a trailing average, since one noisy month makes a single comparison meaningless.
 * `null` without the history to form a norm. The figure IS a deviation, so it carries a tone, and which
 * way is good comes from the measure.
 */
export function vsTypical(
	data: DashboardData,
	monthKey: string,
	m: Measure,
	opts: Opts & { window?: number } = {}
): Scalar {
	const prior = priorMonths(data, monthKey, opts.window);
	const label = opts.label ?? words(measureLabel(m));
	if (!prior.length) {
		return { kind: 'scalar', unit: MONEY(data.currency), label, value: null, note: opts.note };
	}

	const avg =
		prior.reduce((a, k) => a + measureValue(data, { level: 'month', monthKey: k }, m), 0) /
		prior.length;
	const delta = measureValue(data, { level: 'month', monthKey }, m) - avg;

	return {
		kind: 'scalar',
		unit: MONEY(data.currency),
		label,
		value: delta,
		tone: toneOf(m, delta),
		note: opts.note ?? live(`vs your ${money(avg)} / mo average`)
	};
}

/**
 * A measure with its period-over-period change as a `delta`: against the prior year (`at` = a year,
 * default latest) or the prior month (`at` = a month key). The delta is a percentage, omitted when the
 * prior period is 0. The value is a plain level; only the delta carries whether the move was good news.
 */
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

	return {
		kind: 'scalar',
		unit: MONEY(data.currency),
		label: opts.label ?? words(measureLabel(m)),
		value: now,
		// Flattened: a delta's note rides with the badge, which is never renamed.
		delta: deltaOf(
			m,
			now,
			measureValue(data, prev, m),
			opts.note ? labelText(opts.note) : period === 'year' ? 'YoY' : 'MoM'
		)
	};
}
