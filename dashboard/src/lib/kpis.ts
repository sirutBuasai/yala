// KPI derivations for the per-tab summary header.

import type { DashboardData } from './types';
import { MONTHS, money, pct, monthLabel } from './format';

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
	const monthly = yd.matrix.map((row) => Object.values(row.spent).reduce((a, b) => a + b, 0));
	const activeMonths = monthly.filter((v) => v > 0).length || 1;
	const biggestIdx = monthly.indexOf(Math.max(...monthly));
	const cats = data.meta.categories.map((c) => ({
		category: c,
		amount: yd.matrix.reduce((s, r) => s + (r.spent[c] ?? 0), 0)
	}));
	const top = [...cats].sort((a, b) => b.amount - a.amount)[0];
	return [
		{ label: `Spent ${year}`, value: money(yd.total_spent), foot: 'across the year' },
		{
			label: 'Avg / month',
			value: money(yd.total_spent / activeMonths),
			foot: `${activeMonths} active months`
		},
		{
			label: 'Biggest month',
			value: MONTHS[biggestIdx] || '—',
			delta: money(monthly[biggestIdx] || 0)
		},
		{
			label: 'Top category',
			value: top?.category || '—',
			delta: top ? money(top.amount) : '',
			foot: top ? `${pct(top.amount, yd.total_spent)} of spend` : ''
		}
	];
}

export function overviewKpis(data: DashboardData): KpiTile[] {
	const rows = data.overview.by_year;
	if (!rows.length) return [];
	const income = rows.reduce((a, r) => a + r.income, 0);
	const spent = rows.reduce((a, r) => a + r.spent, 0);
	const saved = rows.reduce((a, r) => a + r.saved, 0);
	const first = rows[0].year;
	const last = rows[rows.length - 1].year;
	return [
		{ label: 'Lifetime income', value: money(income), foot: 'net, all years' },
		{ label: 'Lifetime spent', value: money(spent), foot: 'all years' },
		{
			label: 'Lifetime saved',
			value: money(saved),
			dir: saved >= 0 ? 'up' : 'down',
			foot: 'income − spent'
		},
		{ label: 'Savings rate', value: pct(saved, income), foot: 'overall' },
		{ label: 'Years tracked', value: `${first}–${last}`, foot: `${rows.length} years` },
		{ label: 'Avg saved / year', value: money(saved / rows.length), foot: 'across tracked years' }
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
			foot: 'income − spent'
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
			foot: 'tax + insurance'
		},
		{
			label: 'Contributions',
			value: money(iy.contributions),
			foot: '401k / HSA / Roth'
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
