// Series & multi-series primitives over the canonical sections. A `Series` is one
// ordered sequence; a `MultiSeries` bundles several that share an axis and labels
// (so they overlay). No colours here — the chart registry assigns them.

import type { DashboardData } from '$lib/data/types';
import type { Axis, MultiSeries, Series, SeriesPoint, Unit } from './primitives';
import { MONEY, PERCENT } from './primitives';
import { MONTHS } from '$lib/utils/format';
import { sumValues } from '$lib/utils/num';

/** Build a Series from parallel labels/values. */
export function series(
	name: string,
	labels: string[],
	values: (number | null)[],
	unit: Unit,
	axis: Axis = 'time'
): Series {
	const points: SeriesPoint[] = labels.map((label, i) => ({ label, value: values[i] ?? 0 }));
	return { kind: 'series', unit, axis, name, points };
}

function latestYear(data: DashboardData): number {
	const ys = data.meta.years;
	return ys.length ? ys[ys.length - 1] : new Date().getFullYear();
}

/** Total spent per calendar month (index 0..11) for a year. */
function yearMonthlySpent(data: DashboardData, year: number): number[] {
	const yd = data.years[String(year)];
	return yd ? yd.matrix.map((row) => sumValues(row.spent)) : new Array(12).fill(0);
}

// --- spending ---

export function spendingByMonth(data: DashboardData, year?: number): Series {
	const currency = data.currency;

	if (year == null) {
		return series(
			'Spending',
			data.meta.month_keys,
			data.meta.month_keys.map((k) => data.months[k]?.total_spent ?? 0),
			MONEY(currency)
		);
	}

	return series('Spending', MONTHS, yearMonthlySpent(data, year), MONEY(currency));
}

export function spendingByYear(data: DashboardData): Series {
	return series(
		'Spending',
		data.overview.by_year.map((y) => String(y.year)),
		data.overview.by_year.map((y) => y.spent),
		MONEY(data.currency)
	);
}

// --- income ---

export function incomeByMonth(data: DashboardData, year?: number): Series {
	const currency = data.currency;

	if (year == null) {
		return series(
			'Income',
			data.meta.month_keys,
			data.meta.month_keys.map((k) => data.months[k]?.total_income ?? 0),
			MONEY(currency)
		);
	}

	const byMonth = data.income.by_month[String(year)] ?? new Array(12).fill(0);
	return series('Income', MONTHS, byMonth, MONEY(currency));
}

export function incomeByYear(data: DashboardData): Series {
	return series(
		'Income',
		data.income.by_year.map((y) => String(y.year)),
		data.income.by_year.map((y) => y.gross),
		MONEY(data.currency)
	);
}

// --- composite ---

/**
 * Income / Spent / Saved as one MultiSeries. Lifetime (`year` omitted) plots per
 * tracked year; a specific `year` plots its twelve months. Overview and Yearly both
 * used to assemble this by hand — now one builder serves both.
 */
export function incomeSpentSaved(data: DashboardData, year?: number): MultiSeries {
	const unit = MONEY(data.currency);

	if (year == null) {
		const by = data.overview.by_year;
		const labels = by.map((r) => String(r.year));
		return {
			kind: 'multiseries',
			unit,
			axis: 'ordinal',
			labels,
			series: [
				series(
					'Income',
					labels,
					by.map((r) => r.income),
					unit,
					'ordinal'
				),
				series(
					'Spent',
					labels,
					by.map((r) => r.spent),
					unit,
					'ordinal'
				),
				series(
					'Saved',
					labels,
					by.map((r) => r.saved),
					unit,
					'ordinal'
				)
			]
		};
	}

	const yd = data.years[String(year)];
	const income = MONTHS.map((_, m) => yd?.matrix[m]?.income ?? 0);
	const spent = MONTHS.map((_, m) => sumValues(yd?.matrix[m]?.spent ?? {}));
	const saved = income.map((v, i) => v - spent[i]);

	return {
		kind: 'multiseries',
		unit,
		axis: 'ordinal',
		labels: MONTHS,
		series: [
			series('Income', MONTHS, income, unit, 'ordinal'),
			series('Spent', MONTHS, spent, unit, 'ordinal'),
			series('Saved', MONTHS, saved, unit, 'ordinal')
		]
	};
}

/** Running total of yearly savings. */
export function cumulativeSaved(data: DashboardData): Series {
	let run = 0;
	const by = data.overview.by_year;
	return series(
		'Cumulative saved',
		by.map((r) => String(r.year)),
		by.map((r) => (run += r.saved)),
		MONEY(data.currency)
	);
}

/** Savings-to-income ratio per year, as a percentage. */
export function savingsRate(data: DashboardData): Series {
	const by = data.overview.by_year;
	return series(
		'Savings rate',
		by.map((r) => String(r.year)),
		by.map((r) => (r.income ? (r.saved / r.income) * 100 : 0)),
		PERCENT
	);
}
