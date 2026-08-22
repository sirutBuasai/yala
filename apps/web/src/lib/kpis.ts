// KPI derivations for the per-tab summary header.

import type { DashboardData } from './types';
import { money, pct, monthLabel } from './format';

export interface KpiTile {
	label: string;
	value: string;
	delta?: string;
	dir?: 'up' | 'down';
	foot?: string;
}

export function spendingKpis(data: DashboardData, year: number): KpiTile[] {
	const yd = data.years[String(year)];

	if (!yd) return [];

	const monthlySpent = yd.matrix.map((row) => Object.values(row.spent).reduce((a, b) => a + b, 0));
	const activeSpendMonths = monthlySpent.filter((v) => v > 0).length || 1;
	const activeIncomeMonths = yd.matrix.filter((row) => row.income > 0).length || 1;
	const activeMonths =
		yd.matrix.filter((row, i) => row.income > 0 || monthlySpent[i] > 0).length || 1;

	const avgIncome = yd.total_income / activeIncomeMonths;
	const avgSpending = yd.total_spent / activeSpendMonths;
	const avgSavings = avgIncome - avgSpending;

	return [
		{ label: `Spent ${year}`, value: money(yd.total_spent), foot: 'across the year' },
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
	const md = data.months[monthKey];

	if (!md) return [];

	const income = md.total_income;
	const spent = md.total_spent;
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

	if (!iy) return [];

	const saved = ovy?.saved ?? 0;
	const income = ovy?.income ?? iy.net;

	return [
		{ label: `Gross · ${year}`, value: money(iy.gross), foot: 'before tax & deductions' },
		{
			label: `Deductions · ${year}`,
			value: money(iy.deductions),
			foot: 'tax + benefits'
		},
		{
			label: 'Contributions',
			value: money(iy.contributions),
			foot: 'HSA + 401k'
		},
		{
			label: `Net · ${year}`,
			value: money(iy.net),
			delta: `${pct(saved, income)} savings rate`,
			dir: saved >= 0 ? 'up' : 'down',
			foot: `${money(iy.take_home)} take-home + ${money(iy.contributions)} saved`
		}
	];
}
