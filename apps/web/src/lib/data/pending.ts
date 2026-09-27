import type { DashboardData, Txn } from '$lib/data/types';
import type { TxnRow } from '$lib/lists/TransactionList.svelte';

function toRow(t: Txn): TxnRow {
	return {
		locator: t.locator,
		date: t.date,
		payee: t.payee,
		amount: t.amount,
		category: t.category,
		source: t.source,
		pending: t.pending,
		bill: t.bill
	};
}

/** Transactions `keep` accepts, newest first, from one month ("YYYY-MM") or from every month. */
function rows(data: DashboardData, keep: (t: Txn) => boolean, monthKey?: string): TxnRow[] {
	const pages = monthKey
		? data.months[monthKey]
			? [data.months[monthKey]]
			: []
		: Object.values(data.months);
	return pages
		.flatMap((page) => page.transactions.filter(keep).map(toRow))
		.sort((a, b) => b.date.localeCompare(a.date));
}

/** Newest first; `monthKey` scopes to one month, else all. */
export function pendingRows(data: DashboardData, monthKey?: string): TxnRow[] {
	return rows(data, (t) => t.pending, monthKey);
}

/** The `count` latest transactions from any month, newest first. */
export function recentRows(data: DashboardData, count: number): TxnRow[] {
	return rows(data, () => true).slice(0, count);
}
