// Named buckets exist only per paycheck, so paycheck proportions are scaled onto the scope's totals to keep
// the diagram reconciled with the KPIs.

import type { DashboardData } from '$lib/data/types';
import type { Flow, FlowLink, FlowNode } from './primitives';
import { MONEY } from './primitives';
import { sumBy, sumValues } from '$lib/utils/num';
import { categoryTotals, componentKeys, measureValue } from './metric';
import type { Scope } from './scope';

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

/** Spending per category in `scope`, biggest first. */
function scopeCategories(
	data: DashboardData,
	scope: Scope
): { category: string; amount: number }[] {
	return Object.entries(categoryTotals(data, scope))
		.filter(([, v]) => v > 0)
		.map(([category, amount]) => ({ category, amount }))
		.sort((a, b) => b.amount - a.amount);
}

/** Each line item's total over the scope's paychecks. */
function componentTotals(
	data: DashboardData,
	scope: Scope,
	group: 'deductions' | 'contributions'
): Record<string, number> {
	return Object.fromEntries(
		componentKeys(data, scope)[group].map((key) => [key, measureValue(data, scope, { group, key })])
	);
}

const FROM_SAVINGS = 'From savings';

/** The flow of one month, one year, or the lifetime. */
export function moneyFlow(data: DashboardData, scope: Scope): Flow {
	const gross = measureValue(data, scope, 'gross');
	const takeHome = measureValue(data, scope, 'takehome');
	const dedTotal = measureValue(data, scope, 'deductions');
	const conTotal = measureValue(data, scope, 'contributions');

	const ded = distribute(componentTotals(data, scope, 'deductions'), dedTotal, 'Deductions');
	const con = distribute(componentTotals(data, scope, 'contributions'), conTotal, 'Contributions');

	const cats = scopeCategories(data, scope);
	const spent = sumBy(cats, (c) => c.amount);
	const cashSavings = Math.max(0, takeHome - spent);

	const nodes: FlowNode[] = [{ id: 'Gross', label: 'Gross', value: gross, col: 0, role: 'gross' }];
	const links: FlowLink[] = [];

	for (const [k, v] of Object.entries(ded)) {
		nodes.push({ id: k, label: k, value: v, col: 1, role: 'deduction' });
		links.push({ source: 'Gross', target: k, value: v });
	}
	// Contributions are savings parked before take-home, so they route onward into Saved.
	for (const [k, v] of Object.entries(con)) {
		nodes.push({ id: k, label: k, value: v, col: 1, role: 'saving' });
		links.push({ source: 'Gross', target: k, value: v });
	}
	nodes.push({ id: 'Take-home', label: 'Take-home', value: takeHome, col: 1, role: 'takehome' });
	links.push({ source: 'Gross', target: 'Take-home', value: takeHome });
	// Spending past take-home was paid from savings: without its own source the take-home fan would
	// overflow its node, which a month without a paycheck always does.
	const shortfall = Math.max(0, spent - takeHome);
	nodes.push({ id: FROM_SAVINGS, label: FROM_SAVINGS, value: shortfall, col: 1, role: 'saving' });

	// Saved sits atop the last column, aligned with its feeders, so those ribbons miss the spending fan.
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

	// Link order is load-bearing: the chart stacks each source's outgoing fan in it, so Saved's incoming
	// links must precede the category links to stay at the top.
	for (const [k, v] of Object.entries(con)) links.push({ source: k, target: 'Saved', value: v });
	links.push({ source: 'Take-home', target: 'Saved', value: cashSavings });
	// Take-home covers the biggest categories first, so the savings fan stays at the bottom by the tail.
	let left = Math.min(takeHome, spent);
	for (const c of cats) {
		const fromPay = Math.min(left, c.amount);
		left -= fromPay;
		links.push({ source: 'Take-home', target: c.category, value: fromPay });
		links.push({ source: FROM_SAVINGS, target: c.category, value: c.amount - fromPay });
	}

	// A zero node or link would still draw as a sliver.
	return {
		kind: 'flow',
		unit: MONEY(data.currency),
		nodes: nodes.filter((n) => n.value > 0),
		links: links.filter((l) => l.value > 0)
	};
}
