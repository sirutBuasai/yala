// Scalar primitives: the single figures behind each tab's KPI row. Calculations
// live here (the data layer); rendering/formatting lives in the visualization
// layer (KpiRow → formatUnit), so these carry raw numbers + units, never strings.

import type { DashboardData } from '$lib/data/types';
import type { Scalar } from './primitives';
import { MONEY, PERCENT } from './primitives';
import { money, monthLabel } from '$lib/utils/format';
import { sumValues } from '$lib/utils/num';

export function spendingScalars(data: DashboardData, year: number): Scalar[] {
	const unit = MONEY(data.currency);
	// Tolerate a year with no data yet (navigated-to empty year): everything reads as zero.
	const yd = data.years[String(year)];
	const matrix = yd?.matrix ?? [];

	const monthlySpent = matrix.map((row) => sumValues(row.spent));
	const activeSpendMonths = monthlySpent.filter((v) => v > 0).length || 1;
	const activeIncomeMonths = matrix.filter((row) => row.income > 0).length || 1;
	const activeMonths = matrix.filter((row, i) => row.income > 0 || monthlySpent[i] > 0).length || 1;

	const totalIncome = yd?.total_income ?? 0;
	const totalSpent = yd?.total_spent ?? 0;
	const avgIncome = totalIncome / activeIncomeMonths;
	const avgSpending = totalSpent / activeSpendMonths;
	const avgSavings = avgIncome - avgSpending;

	return [
		{ kind: 'scalar', unit, label: `Spent ${year}`, value: totalSpent, note: 'across the year' },
		{
			kind: 'scalar',
			unit,
			label: 'Avg income / month',
			value: avgIncome,
			note: `${activeIncomeMonths} active months`
		},
		{
			kind: 'scalar',
			unit,
			label: 'Avg spending / month',
			value: avgSpending,
			note: `${activeSpendMonths} active months`
		},
		{
			kind: 'scalar',
			unit,
			label: 'Avg savings / month',
			value: avgSavings,
			dir: avgSavings >= 0 ? 'up' : 'down',
			note: `${activeMonths} active months`
		}
	];
}

export function overviewScalars(data: DashboardData): Scalar[] {
	const unit = MONEY(data.currency);
	const rows = data.overview.by_year;

	if (!rows.length) return [];

	const income = rows.reduce((a, r) => a + r.income, 0);
	const spent = rows.reduce((a, r) => a + r.spent, 0);
	const saved = rows.reduce((a, r) => a + r.saved, 0);
	const nYears = rows.length;

	return [
		{ kind: 'scalar', unit, label: 'Lifetime income', value: income, note: 'net income' },
		{ kind: 'scalar', unit, label: 'Lifetime spent', value: spent, note: 'net spending' },
		{
			kind: 'scalar',
			unit,
			label: 'Lifetime saved',
			value: saved,
			dir: saved >= 0 ? 'up' : 'down',
			note: 'net savings'
		},
		{
			kind: 'scalar',
			unit,
			label: 'Avg income / year',
			value: income / nYears,
			note: `${nYears} tracked years`
		},
		{
			kind: 'scalar',
			unit,
			label: 'Avg spending / year',
			value: spent / nYears,
			note: `${nYears} tracked years`
		},
		{
			kind: 'scalar',
			unit,
			label: 'Avg saving / year',
			value: saved / nYears,
			dir: saved >= 0 ? 'up' : 'down',
			note: 'income − spending'
		}
	];
}

export function monthlyScalars(data: DashboardData, monthKey: string): Scalar[] {
	const unit = MONEY(data.currency);
	// Tolerate an empty month (navigated-to month with no data yet): reads as zero.
	const md = data.months[monthKey];

	const income = md?.total_income ?? 0;
	const spent = md?.total_spent ?? 0;
	const saved = income - spent;

	return [
		{
			kind: 'scalar',
			unit,
			label: `Income · ${monthLabel(monthKey)}`,
			value: income,
			note: 'take-home + saved'
		},
		{ kind: 'scalar', unit, label: 'Spent', value: spent, note: 'this month' },
		{
			kind: 'scalar',
			unit,
			label: 'Saved',
			value: saved,
			dir: saved >= 0 ? 'up' : 'down',
			note: 'this month'
		},
		{
			kind: 'scalar',
			unit: PERCENT,
			label: '% used',
			value: income ? (spent / income) * 100 : null,
			note: income ? 'of income spent' : 'no income this month'
		}
	];
}

export function incomeScalars(data: DashboardData, year: number): Scalar[] {
	const unit = MONEY(data.currency);
	const iy = data.income.by_year.find((r) => r.year === year);
	const ovy = data.overview.by_year.find((r) => r.year === year);

	// Tolerate a year with no income rows yet (navigated-to empty year): reads as zero.
	const gross = iy?.gross ?? 0;
	const deductions = iy?.deductions ?? 0;
	const contributions = iy?.contributions ?? 0;
	const net = iy?.net ?? 0;
	const takeHome = iy?.take_home ?? 0;
	const saved = ovy?.saved ?? 0;
	const income = ovy?.income ?? net;

	return [
		{
			kind: 'scalar',
			unit,
			label: `Gross · ${year}`,
			value: gross,
			note: 'before tax & deductions'
		},
		{
			kind: 'scalar',
			unit,
			label: `Deductions · ${year}`,
			value: deductions,
			note: 'tax + benefits'
		},
		{ kind: 'scalar', unit, label: 'Contributions', value: contributions, note: 'HSA + 401k' },
		{
			kind: 'scalar',
			unit,
			label: `Net · ${year}`,
			value: net,
			dir: saved >= 0 ? 'up' : 'down',
			delta:
				income > 0
					? {
							value: (saved / income) * 100,
							unit: PERCENT,
							dir: saved >= 0 ? 'up' : 'down',
							note: 'savings rate'
						}
					: undefined,
			note: `${money(takeHome)} take-home + ${money(contributions)} saved`
		}
	];
}
