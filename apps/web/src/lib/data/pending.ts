// Pending (unreconciled) transactions as row items, shared by the Home hub (all months) and the
// month-scoped Activity / Monthly views (pass a monthKey).

import type { DashboardData } from '$lib/data/types';
import type { TxnRow } from '$lib/lists/TransactionList.svelte';

/**
 * Pending transactions as `TxnRow`s, newest first. Scope to one month with `monthKey` ("YYYY-MM"),
 * or omit for all months.
 */
export function pendingRows(data: DashboardData, monthKey?: string): TxnRow[] {
	const pages = monthKey
		? data.months[monthKey]
			? [data.months[monthKey]]
			: []
		: Object.values(data.months);

	const out: TxnRow[] = [];
	for (const page of pages) {
		for (const t of page.transactions) {
			if (t.pending)
				out.push({
					locator: t.locator,
					date: t.date,
					payee: t.payee,
					amount: t.amount,
					category: t.category,
					source: t.source,
					pending: true,
					bill: t.bill
				});
		}
	}
	return out.sort((a, b) => b.date.localeCompare(a.date));
}
