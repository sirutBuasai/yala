// Money-flow primitive: gross → deductions / contributions + take-home → spending categories + savings.
// Totals come from the yearly rollup, but their split into named buckets exists only per-paycheck, so
// paycheck proportions are scaled onto the rollup totals. That keeps the diagram reconciled with the
// KPIs even when paychecks are sparse.

import type { DashboardData } from '$lib/data/types';
import type { Flow, FlowLink, FlowNode } from './primitives';
import { MONEY } from './primitives';
import { sumValues } from '$lib/utils/num';

/** Split `total` across named buckets by their `shares` proportions. Nothing when the total is zero,
 * and a single `fallbackLabel` bucket when there's no breakdown to split by. */
function distribute(
	shares: Record<string, number>,
	total: number,
	fallbackLabel: string
): Record<string, number> {
	if (total <= 0) return {};
	const sum = sumValues(shares);
	if (sum <= 0) return { [fallbackLabel]: total };
	const out: Record<string, number> = {};
	for (const [k, v] of Object.entries(shares)) if (v > 0) out[k] = (v / sum) * total;
	return out;
}

/** Spending per category within one year, biggest first. */
function yearCategories(data: DashboardData, year: number): { category: string; amount: number }[] {
	const rows = data.years[String(year)]?.matrix ?? [];
	const totals: Record<string, number> = {};
	for (const row of rows) {
		for (const [c, v] of Object.entries(row.spent)) totals[c] = (totals[c] ?? 0) + v;
	}
	return Object.entries(totals)
		.filter(([, v]) => v > 0)
		.map(([category, amount]) => ({ category, amount }))
		.sort((a, b) => b.amount - a.amount);
}

/** Lifetime flow, or one year's when `year` is given. */
export function moneyFlow(data: DashboardData, year?: number): Flow {
	const rows =
		year == null ? data.income.by_year : data.income.by_year.filter((r) => r.year === year);
	let gross = 0;
	let takeHome = 0;
	let dedTotal = 0;
	let conTotal = 0;
	for (const iy of rows) {
		gross += iy.gross;
		takeHome += iy.take_home;
		dedTotal += iy.deductions;
		conTotal += iy.contributions;
	}

	// Breakdown proportions from the individual paychecks in scope.
	const prefix = year == null ? '' : `${year}-`;
	const dedShares: Record<string, number> = {};
	const conShares: Record<string, number> = {};
	for (const [key, month] of Object.entries(data.months)) {
		if (prefix && !key.startsWith(prefix)) continue;
		for (const p of month.paychecks) {
			for (const [k, v] of Object.entries(p.deductions)) dedShares[k] = (dedShares[k] ?? 0) + v;
			// Each contribution label is its own bucket, so a label absent from every paycheck never
			// draws a zero-width leg.
			for (const [k, v] of Object.entries(p.contributions)) conShares[k] = (conShares[k] ?? 0) + v;
		}
	}
	const ded = distribute(dedShares, dedTotal, 'Deductions');
	const con = distribute(conShares, conTotal, 'Contributions');

	const cats =
		year == null
			? [...data.overview.all_time_by_category].sort((a, b) => b.amount - a.amount)
			: yearCategories(data, year);
	const spent = cats.reduce((a, c) => a + c.amount, 0);
	const cashSavings = Math.max(0, takeHome - spent);

	const nodes: FlowNode[] = [{ id: 'Gross', label: 'Gross', value: gross, col: 0, role: 'gross' }];
	const links: FlowLink[] = [];

	// Deductions leave the flow entirely.
	for (const [k, v] of Object.entries(ded)) {
		nodes.push({ id: k, label: k, value: v, col: 1, role: 'deduction' });
		links.push({ source: 'Gross', target: k, value: v });
	}
	// Contributions are savings parked before take-home — they route onward into Saved.
	for (const [k, v] of Object.entries(con)) {
		nodes.push({ id: k, label: k, value: v, col: 1, role: 'saving' });
		links.push({ source: 'Gross', target: k, value: v });
	}
	nodes.push({ id: 'Take-home', label: 'Take-home', value: takeHome, col: 1, role: 'takehome' });
	links.push({ source: 'Gross', target: 'Take-home', value: takeHome });

	// Saved sits atop the last column, aligned with the contribution nodes feeding it, so those
	// ribbons don't cross the spending fan.
	nodes.push({
		id: 'Saved',
		label: 'Saved',
		value: conTotal + cashSavings,
		col: 2,
		role: 'saving'
	});
	for (const c of cats) {
		nodes.push({ id: c.category, label: c.category, value: c.amount, col: 2, role: 'category' });
	}

	// Link order is load-bearing: the chart stacks each source's outgoing fan in it, so Saved's
	// incoming links must precede the category links to stay at the top.
	for (const [k, v] of Object.entries(con)) links.push({ source: k, target: 'Saved', value: v });
	links.push({ source: 'Take-home', target: 'Saved', value: cashSavings });
	for (const c of cats) links.push({ source: 'Take-home', target: c.category, value: c.amount });

	return { kind: 'flow', unit: MONEY(data.currency), nodes, links };
}
