// Money-flow primitive: Gross → deductions / contributions + take-home → spending
// categories + Savings.
//
// Totals come from the authoritative yearly rollup (and conserve: gross = deductions +
// contributions + take-home), but their split into named buckets only exists per-paycheck —
// so paycheck proportions are scaled onto the rollup totals. This keeps the diagram reconciled
// with the KPIs even when paychecks are sparse.
//
// Nodes carry a semantic `role` (not a colour); the chart registry maps roles to colours.

import type { DashboardData } from '$lib/data/types';
import type { Flow, FlowLink, FlowNode } from './primitives';
import { MONEY } from './primitives';
import { sumValues } from '$lib/utils/num';

/** Collapse 401k variants (`Roth401k`, `Trad401k`, …) into one `401k` family so the flow
 * doesn't fragment as the ledger gets more granular; other keys pass through unchanged. */
export function contributionFamily(key: string): string {
	if (/401\s*\(?k\)?/i.test(key)) return '401k';
	return key;
}

/** Split `total` across named buckets by their `shares` proportions. Returns nothing when the
 * total is zero, and a single `fallbackLabel` bucket when there's no breakdown to split by. */
function distribute(
	shares: Record<string, number>,
	total: number,
	fallbackLabel: string
): Record<string, number> {
	if (total <= 0) return {};
	const sum = sumValues(shares);
	if (sum <= 0) return { [fallbackLabel]: total };
	const out: Record<string, number> = {};
	for (const [k, v] of Object.entries(shares)) out[k] = (v / sum) * total;
	return out;
}

export function moneyFlow(data: DashboardData): Flow {
	// Authoritative totals from the yearly rollup.
	let gross = 0;
	let takeHome = 0;
	let dedTotal = 0;
	let conTotal = 0;
	for (const iy of data.income.by_year) {
		gross += iy.gross;
		takeHome += iy.take_home;
		dedTotal += iy.deductions;
		conTotal += iy.contributions;
	}

	// Breakdown proportions from the individual paychecks.
	const dedShares: Record<string, number> = {};
	const conShares: Record<string, number> = {};
	for (const key of Object.keys(data.months)) {
		for (const p of data.months[key].paychecks) {
			for (const [k, v] of Object.entries(p.deductions)) dedShares[k] = (dedShares[k] ?? 0) + v;
			for (const [k, v] of Object.entries(p.contributions)) {
				const fam = contributionFamily(k);
				conShares[fam] = (conShares[fam] ?? 0) + v;
			}
		}
	}
	const ded = distribute(dedShares, dedTotal, 'Deductions');
	const con = distribute(conShares, conTotal, 'Contributions');

	const cats = [...data.overview.all_time_by_category].sort((a, b) => b.amount - a.amount);
	const spent = cats.reduce((a, c) => a + c.amount, 0);
	const cashSavings = Math.max(0, takeHome - spent);

	const nodes: FlowNode[] = [{ id: 'Gross', label: 'Gross', value: gross, col: 0, role: 'gross' }];
	const links: FlowLink[] = [];

	// True deductions leave the flow entirely.
	for (const [k, v] of Object.entries(ded)) {
		nodes.push({ id: k, label: k, value: v, col: 1, role: 'deduction' });
		links.push({ source: 'Gross', target: k, value: v });
	}
	// Contributions are savings parked before take-home — they route onward into Savings.
	for (const [k, v] of Object.entries(con)) {
		nodes.push({ id: k, label: k, value: v, col: 1, role: 'saving' });
		links.push({ source: 'Gross', target: k, value: v });
	}
	nodes.push({ id: 'Take-home', label: 'Take-home', value: takeHome, col: 1, role: 'takehome' });
	links.push({ source: 'Gross', target: 'Take-home', value: takeHome });

	// Savings sits atop the last column — aligned with the contribution nodes feeding it, so
	// those ribbons don't cross the spending fan — then the categories below.
	nodes.push({
		id: 'Savings',
		label: 'Savings',
		value: conTotal + cashSavings,
		col: 2,
		role: 'saving'
	});
	for (const c of cats) {
		nodes.push({ id: c.category, label: c.category, value: c.amount, col: 2, role: 'category' });
	}

	// Push Savings' incoming links before the category links so it stacks at the top of each
	// source's outgoing fan.
	for (const [k, v] of Object.entries(con)) links.push({ source: k, target: 'Savings', value: v });
	links.push({ source: 'Take-home', target: 'Savings', value: cashSavings });
	for (const c of cats) links.push({ source: 'Take-home', target: c.category, value: c.amount });

	return { kind: 'flow', unit: MONEY(data.currency), nodes, links };
}
