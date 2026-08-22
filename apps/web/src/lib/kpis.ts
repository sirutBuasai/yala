// KPI derivations for the per-tab summary header.

import type { DashboardData } from './types';
import { money, pct, monthLabel } from './format';
import { sumValues } from './num';

export interface KpiTile {
	label: string;
	value: string;
	delta?: string;
	dir?: 'up' | 'down';
	foot?: string;
}

export function spendingKpis(data: DashboardData, year: number): KpiTile[] {
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
		{ label: `Spent ${year}`, value: money(totalSpent), foot: 'across the year' },
		{
			label: 'Avg income / month',
			value: money(avgIncome),
			foot: `${activeIncomeMonths} active months`
		},
		{
			label: 'Avg spending / month',
			value: money(avgSpending),
			foot: `${activeSpendMonths} active months`
		},
		{
			label: 'Avg savings / month',
			value: money(avgSavings),
			dir: avgSavings >= 0 ? 'up' : 'down',
			foot: `${activeMonths} active months`
		}
	];
}

export function overviewKpis(data: DashboardData): KpiTile[] {
	const rows = data.overview.by_year;

	if (!rows.length) return [];

	const income = rows.reduce((a, r) => a + r.income, 0);
	const spent = rows.reduce((a, r) => a + r.spent, 0);
	const saved = rows.reduce((a, r) => a + r.saved, 0);
	const nYears = rows.length;

	return [
		{ label: 'Lifetime income', value: money(income), foot: 'net income' },
		{ label: 'Lifetime spent', value: money(spent), foot: 'net spending' },
		{
			label: 'Lifetime saved',
			value: money(saved),
			dir: saved >= 0 ? 'up' : 'down',
			foot: 'net savings'
		},
		{ label: 'Avg income / year', value: money(income / nYears), foot: `${nYears} tracked years` },
		{ label: 'Avg spending / year', value: money(spent / nYears), foot: `${nYears} tracked years` },
		{
			label: 'Avg saving / year',
			value: money(saved / nYears),
			dir: saved >= 0 ? 'up' : 'down',
			foot: 'income − spending'
		}
	];
}

export function monthlyKpis(data: DashboardData, monthKey: string): KpiTile[] {
	// Tolerate an empty month (navigated-to month with no data yet): reads as zero.
	const md = data.months[monthKey];

	const income = md?.total_income ?? 0;
	const spent = md?.total_spent ?? 0;
	const saved = income - spent;

	return [
		{ label: `Income · ${monthLabel(monthKey)}`, value: money(income), foot: 'take-home + saved' },
		{ label: 'Spent', value: money(spent), foot: 'this month' },
		{
			label: 'Saved',
			value: money(saved),
			dir: saved >= 0 ? 'up' : 'down',
			foot: 'this month'
		},
		{
			label: '% used',
			value: income ? pct(spent, income) : '—',
			foot: income ? 'of income spent' : 'no income this month'
		}
	];
}

export function incomeKpis(data: DashboardData, year: number): KpiTile[] {
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
		{ label: `Gross · ${year}`, value: money(gross), foot: 'before tax & deductions' },
		{ label: `Deductions · ${year}`, value: money(deductions), foot: 'tax + benefits' },
		{ label: 'Contributions', value: money(contributions), foot: 'HSA + 401k' },
		{
			label: `Net · ${year}`,
			value: money(net),
			delta: `${pct(saved, income)} savings rate`,
			dir: saved >= 0 ? 'up' : 'down',
			foot: `${money(takeHome)} take-home + ${money(contributions)} saved`
		}
	];
}
