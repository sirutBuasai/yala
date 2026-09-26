// Needs attention: what only you can fix, each item naming the pane that clears it. Pure, so the rules are
// testable apart from the API read the balances item needs.

import type { DashboardData } from '$lib/data/types';
import { pendingRows } from './pending';
import { categoryDeviation } from './deviation';
import { formatUnit, MONEY } from './primitives';
import { monthName } from '$lib/utils/format';

export type AttentionKind = 'pending' | 'balances' | 'category';

export interface AttentionItem {
	kind: AttentionKind;
	title: string;
	detail: string;
	/** Where the item is cleared: a page with its query, the pane, and anything in it to focus. */
	href: string;
	pane: string;
	focus?: string;
	/** What colours its chip: a category's own name, else the kind's. */
	category?: string;
}

/** A month's roster against the accounts with a snapshot in it, as `/api/networth` reports them. */
export interface Unlogged {
	month: string;
	/** Every account the month should log, by ledger path. */
	roster: string[];
	/** Those without a snapshot in the month. */
	missing: string[];
}

const at = (path: string, params: Record<string, string>) =>
	`${path}?${new URLSearchParams(params)}`;

/**
 * Pending rows from any month, then the month's unlogged balances, then every category spending past the
 * highest of its prior months, furthest past first. `label` names an account for display.
 */
export function attentionItems(
	data: DashboardData,
	monthKey: string,
	unlogged: Unlogged | null,
	label: (account: string) => string
): AttentionItem[] {
	const items: AttentionItem[] = [];
	const unit = MONEY(data.currency);

	const pending = pendingRows(data).length;
	if (pending) {
		items.push({
			kind: 'pending',
			title: `${pending} pending transaction${pending === 1 ? '' : 's'}`,
			detail: 'waiting for posting, refunds, or credits',
			href: at('/transactions', { month: monthKey }),
			pane: 'pending'
		});
	}

	if (unlogged?.missing.length) {
		items.push({
			kind: 'balances',
			title: `${unlogged.missing.length} of ${unlogged.roster.length} accounts not logged for ${monthName(unlogged.month)}`,
			detail: unlogged.missing.map(label).join(', '),
			href: at('/accounts', { month: unlogged.month }),
			pane: 'balances',
			focus: unlogged.missing[0]
		});
	}

	const over = categoryDeviation(data, monthKey)
		.rows.filter((r) => r.value > r.hi)
		.sort((a, b) => b.value - b.hi - (a.value - a.hi));
	for (const r of over) {
		const f = (v: number) => formatUnit(v, unit);
		items.push({
			kind: 'category',
			title: `${r.label} is above its usual range`,
			detail: `${f(r.value)} so far, usual ${f(r.base)} (${f(r.lo)}–${f(r.hi)})`,
			href: at('/transactions', { month: monthKey, category: r.label }),
			pane: 'history',
			category: r.label
		});
	}

	return items;
}
