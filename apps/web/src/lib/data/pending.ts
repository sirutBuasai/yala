import type { DashboardData, Txn } from '$lib/data/types';
import type { TxnRow } from '$lib/lists/TransactionList.svelte';
import { historyOf, type HistoryEntry } from '$lib/lists/history';

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

/** Pending transactions and bill pays from every month, newest first: a pending entry waits whichever
    month it was logged in. */
export function pendingEntries(data: DashboardData): HistoryEntry[] {
	return Object.values(data.months)
		.flatMap((page) => historyOf(page))
		.filter((e) => e.type !== 'pay' && e.row.pending)
		.sort((a, b) => b.date.localeCompare(a.date));
}

/** The `count` latest transactions from any month, newest first. */
export function recentRows(data: DashboardData, count: number): TxnRow[] {
	return Object.values(data.months)
		.flatMap((page) => page.transactions.map(toRow))
		.sort((a, b) => b.date.localeCompare(a.date))
		.slice(0, count);
}
