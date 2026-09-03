<script module lang="ts">
	// The fields a row renders — a superset of both posted (Txn) and pending transactions.
	export interface TxnRow {
		locator: string;
		date: string;
		payee: string;
		amount: number;
		category: string;
		source: string | null;
		pending: boolean;
		bill?: number | null;
	}

	/** A middle column between the payee and the amount. Extend the union to add more. */
	export type TxnField = 'source' | 'category' | 'bill';

	/** A field the list can be ordered by via the `sortKey` prop. */
	export type TxnSort = 'date' | 'category' | 'amount' | 'source';

	/** Sortable fields with display labels, for driving a SortMenu. */
	export const TXN_SORTS: { key: TxnSort; label: string }[] = [
		{ key: 'date', label: 'Date' },
		{ key: 'category', label: 'Category' },
		{ key: 'amount', label: 'Amount' },
		{ key: 'source', label: 'Source' }
	];
</script>

<script lang="ts">
	import { money, formatAccount } from '$lib/utils/format';
	import { categoryVar } from '$lib/utils/theme';
	import RowList from '$lib/lists/RowList.svelte';
	import Amount from '$lib/ui/Amount.svelte';
	import Badge from '$lib/ui/Badge.svelte';

	interface Props {
		transactions: TxnRow[];
		/** Edit mode: rows become clickable to open the transaction editor. */
		edit: boolean;
		onedit: (locator: string) => void;
		/** Hide the per-row date (e.g. when the surrounding pane already names the day). */
		showDate?: boolean;
		/** Which columns to render between the payee and the amount, in order. */
		fields?: TxnField[];
		/** Field to order rows by; omit to keep the given order. Pair with TransactionSortMenu. */
		sortKey?: TxnSort;
		sortDir?: 'asc' | 'desc';
		/** Fix the list to this many rows tall, then scroll (see RowList). */
		fixedRows?: number;
		/** Remembers this list's expanded state (see RowList). */
		prefKey?: string;
	}
	let {
		transactions,
		edit,
		onedit,
		showDate = true,
		fields = ['source'],
		sortKey,
		sortDir = 'desc',
		fixedRows,
		prefKey
	}: Props = $props();

	function column(t: TxnRow, f: TxnField): string {
		switch (f) {
			case 'source':
				return formatAccount(t.source);
			case 'category':
				return t.category;
			case 'bill':
				return t.bill != null ? money(t.bill) : '';
		}
	}

	function compare(a: TxnRow, b: TxnRow, key: TxnSort): number {
		switch (key) {
			case 'amount':
				return a.amount - b.amount;
			case 'category':
				return a.category.localeCompare(b.category);
			case 'source':
				return formatAccount(a.source).localeCompare(formatAccount(b.source));
			case 'date':
				return a.date.localeCompare(b.date);
		}
	}

	const rows = $derived.by(() => {
		if (!sortKey) return transactions;
		const key = sortKey;
		const dir = sortDir === 'asc' ? 1 : -1;
		return [...transactions].sort((a, b) => {
			const cmp = compare(a, b, key);
			// Break ties by recency so equal keys keep a stable, sensible order.
			return (cmp || b.date.localeCompare(a.date)) * dir;
		});
	});

	// One track per requested field, so the same field lines up down the list.
	const columnTracks = $derived('auto '.repeat(fields.length).trim());
</script>

<RowList
	items={rows}
	{edit}
	{onedit}
	{columnTracks}
	{fixedRows}
	{prefKey}
	dotColor={(t) => categoryVar(t.category)}
	dateOf={showDate ? (t) => t.date : undefined}
>
	{#snippet main(t)}
		<span class="main">
			<span class="title">
				<span class="payee">{t.payee}</span>
				{#if t.pending}<Badge tone="warn" dot>pending</Badge>{/if}
			</span>
			<span class="cat">{t.category}</span>
		</span>
	{/snippet}
	{#snippet columns(t)}
		{#each fields as f (f)}<span class="col">{column(t, f)}</span>{/each}
	{/snippet}
	{#snippet amount(t)}
		<Amount value={t.amount} sign="refund" />
	{/snippet}
</RowList>

<style>
	.main {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.title {
		display: flex;
		align-items: baseline;
		gap: var(--space-3);
		min-width: 0;
		font-size: var(--text-row);
		font-weight: var(--fw-medium);
	}
	.payee {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		min-width: 0;
	}
	.cat {
		color: var(--ink-3);
		font-size: var(--text-badge);
	}
	.col {
		color: var(--ink-2);
		font-size: var(--text-caption);
		white-space: nowrap;
	}
</style>
