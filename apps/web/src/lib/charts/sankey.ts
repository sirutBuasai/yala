// Lifetime money-flow model for the Sankey diagram:
//
//   Gross ─┬─▶ Tax / Insurance …            (true deductions — leave the flow)
//          ├─▶ HSA / 401k …  ─▶ Savings     (contributions — parked savings)
//          └─▶ Take-home ─┬─▶ spending categories …
//                         └─▶ Savings        (cash left over)
//
// Reconciliation of two data sources:
//   • The authoritative TOTALS (gross, take-home, deduction & contribution sums) come from
//     `income.by_year`. These conserve exactly: gross = deductions + contributions + take-home.
//   • The BREAKDOWN of those deduction/contribution totals into named buckets (Tax, HSA,
//     401k, …) only exists on individual paychecks, so we derive the split from paycheck
//     proportions and scale it onto the authoritative total. That keeps the diagram
//     reconciled with the KPIs even when paychecks are sparse, and `Savings` collapses to
//     exactly the overview's lifetime "saved" (contributions + cash surplus = net − spent).

import type { DashboardData } from '$lib/types';
import { categoryVar } from '$lib/theme';
import { sumValues } from '$lib/num';

export interface SankeyNode {
	id: string;
	label: string;
	value: number;
	color: string;
	/** Column index (0 = leftmost). */
	col: number;
}
export interface SankeyLink {
	source: string;
	target: string;
	value: number;
}
export interface SankeyModel {
	nodes: SankeyNode[];
	links: SankeyLink[];
}

/**
 * Collapse contribution account keys into a stable family so the flow doesn't fragment
 * as the ledger gets more granular. Today the ledger emits a flat `401k`; tomorrow it may
 * split into `Roth401k` / `Trad401k` / `AfterTax401k` — all of which roll up into one
 * `401k` band here. Any other key (e.g. `HSA`) passes through unchanged.
 *
 * This is the single place to change if we ever want to surface the 401k sub-buckets
 * individually instead of rolling them up.
 */
export function contributionFamily(key: string): string {
	if (/401\s*\(?k\)?/i.test(key)) return '401k';
	return key;
}

/**
 * Split `total` across named buckets using `shares` (raw paycheck sums) as proportions.
 * Falls back to a single `fallbackLabel` bucket when no breakdown is available, and returns
 * nothing when the total is zero — so a bucket is only shown when it carries value.
 */
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

export function sankeyModel(data: DashboardData): SankeyModel {
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

	const nodes: SankeyNode[] = [
		{ id: 'Gross', label: 'Gross', value: gross, color: 'var(--lav)', col: 0 }
	];
	const links: SankeyLink[] = [];

	// True deductions leave the flow entirely.
	for (const [k, v] of Object.entries(ded)) {
		nodes.push({ id: k, label: k, value: v, color: 'var(--salmon)', col: 1 });
		links.push({ source: 'Gross', target: k, value: v });
	}
	// Contributions are savings parked before take-home — they route onward into Savings.
	for (const [k, v] of Object.entries(con)) {
		nodes.push({ id: k, label: k, value: v, color: 'var(--saved)', col: 1 });
		links.push({ source: 'Gross', target: k, value: v });
	}
	nodes.push({ id: 'Take-home', label: 'Take-home', value: takeHome, color: 'var(--lav)', col: 1 });
	links.push({ source: 'Gross', target: 'Take-home', value: takeHome });

	// Last column: Savings on top (aligned with the contribution nodes that feed it, which
	// keeps those ribbons from crossing the spending fan), then the spending categories.
	nodes.push({
		id: 'Savings',
		label: 'Savings',
		value: conTotal + cashSavings,
		color: 'var(--saved)',
		col: 2
	});
	for (const c of cats) {
		nodes.push({
			id: c.category,
			label: c.category,
			value: c.amount,
			color: categoryVar(c.category),
			col: 2
		});
	}

	// Savings gathers every contribution plus the cash surplus (= net − spent). Push these
	// links (and Take-home's Savings slice) before the category links so Savings stacks at
	// the top of each source's outgoing fan.
	for (const [k, v] of Object.entries(con)) links.push({ source: k, target: 'Savings', value: v });
	links.push({ source: 'Take-home', target: 'Savings', value: cashSavings });
	for (const c of cats) links.push({ source: 'Take-home', target: c.category, value: c.amount });

	return { nodes, links };
}
