// One month's transactions, paychecks and bill pay as a single history:
// the rows, the filters over them, and the summary of whatever the filters leave.

import type { PaycheckOut, Transfer, Txn } from '$lib/data/types';
import type { TxnSort } from '$lib/lists/TransactionList.svelte';
import { formatAccount } from '$lib/utils/format';
import { sumBy } from '$lib/utils/num';

export type EntryType = 'txn' | 'pay' | 'xfer';

export type HistoryEntry =
	| { type: 'txn'; locator: string; date: string; row: Txn }
	| { type: 'pay'; locator: string; date: string; row: PaycheckOut }
	| { type: 'xfer'; locator: string; date: string; row: Transfer };

export interface MonthRows {
	transactions: Txn[];
	paychecks: PaycheckOut[];
	transfers?: Transfer[];
}

/** A null field is a filter that is off. */
export interface HistoryFilter {
	type: EntryType | null;
	category: string | null;
	account: string | null;
	search: string;
}

/** Every entry of the month, newest first. */
export function historyOf(md: MonthRows | undefined): HistoryEntry[] {
	if (!md) return [];
	const entries: HistoryEntry[] = [
		...md.transactions.map((row) => ({
			type: 'txn' as const,
			locator: row.locator,
			date: row.date,
			row
		})),
		...md.paychecks.map((row) => ({
			type: 'pay' as const,
			locator: row.locator,
			date: row.date,
			row
		})),
		...(md.transfers ?? []).map((row) => ({
			type: 'xfer' as const,
			locator: row.locator,
			date: row.date,
			row
		}))
	];
	return entries.sort((a, b) => b.date.localeCompare(a.date));
}

/** The accounts an entry moves money through. A paycheck names none, so an account filter drops it. */
export function accountsOf(e: HistoryEntry): string[] {
	if (e.type === 'txn') return e.row.source ? [e.row.source] : [];
	if (e.type === 'xfer') return [e.row.from_account, e.row.to_account];
	return [];
}

/** What a search matches: the title, and for bill pay the accounts on either side. */
function searchText(e: HistoryEntry): string {
	return [e.row.payee, ...accountsOf(e).map(formatAccount)].join(' ').toLowerCase();
}

export function filterHistory(entries: HistoryEntry[], f: HistoryFilter): HistoryEntry[] {
	const q = f.search.trim().toLowerCase();
	return entries.filter(
		(e) =>
			(!f.type || e.type === f.type) &&
			(!f.category || (e.type === 'txn' && e.row.category === f.category)) &&
			(!f.account || accountsOf(e).includes(f.account)) &&
			(!q || searchText(e).includes(q))
	);
}

/** The figure a row shows in its amount cell. */
function amountOf(e: HistoryEntry): number {
	return e.type === 'pay' ? e.row.net : e.row.amount;
}

const sortValue: Record<TxnSort, (e: HistoryEntry) => string | number> = {
	date: (e) => e.date,
	amount: amountOf,
	category: (e) => (e.type === 'txn' ? e.row.category : ''),
	source: (e) => formatAccount(accountsOf(e)[0] ?? null)
};

/** Ordered by the transaction lists' own sort fields, newest first within a tie. */
export function sortHistory(
	entries: HistoryEntry[],
	key: TxnSort,
	dir: 'asc' | 'desc'
): HistoryEntry[] {
	const value = sortValue[key];
	const sign = dir === 'asc' ? 1 : -1;
	return [...entries].sort((a, b) => {
		const [x, y] = [value(a), value(b)];
		const cmp =
			typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
		return (cmp || b.date.localeCompare(a.date)) * sign;
	});
}

/**
 * What the summary shows for a filtered list. It reads the rows left, never the filters that left them,
 * so every combination of filters follows the same rules: a figure per kind of row present, and the
 * category the transactions share when they all share one, so its average can be set beside them.
 */
export interface HistorySummary {
	count: number;
	spent: number | null;
	takehome: number | null;
	billpay: number | null;
	category: string | null;
}

export function summarize(entries: HistoryEntry[]): HistorySummary {
	const txns = entries.flatMap((e) => (e.type === 'txn' ? [e.row] : []));
	const pays = entries.flatMap((e) => (e.type === 'pay' ? [e.row] : []));
	const xfers = entries.flatMap((e) => (e.type === 'xfer' ? [e.row] : []));
	const categories = new Set(txns.map((t) => t.category));
	return {
		count: entries.length,
		spent: txns.length ? sumBy(txns, (t) => t.amount) : null,
		takehome: pays.length ? sumBy(pays, (p) => p.take_home) : null,
		billpay: xfers.length ? sumBy(xfers, (t) => t.amount) : null,
		category: categories.size === 1 ? [...categories][0]! : null
	};
}
