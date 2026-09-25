<script module lang="ts">
	// A superset of the fields on both posted and pending transactions.
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

	/** A middle column between the payee and the amount. */
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
	import TxnMain from '$lib/lists/parts/TxnMain.svelte';
	import MetaCol from '$lib/lists/parts/MetaCol.svelte';

	interface Props {
		transactions: TxnRow[];
		/** Supply to make rows clickable — they open the transaction editor. */
		onedit?: (locator: string) => void;
		/** Hide the per-row date, for a pane that already names the day. */
		showDate?: boolean;
		/** Which columns to render between the payee and the amount, in order. */
		fields?: TxnField[];
		/** Field to order rows by; omit to keep the given order. */
		sortKey?: TxnSort;
		sortDir?: 'asc' | 'desc';
	}
	let {
		transactions,
		onedit,
		showDate = true,
		fields = ['source'],
		sortKey,
		sortDir = 'desc'
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
			// Break ties by recency so equal keys keep a stable order.
			return (cmp || b.date.localeCompare(a.date)) * dir;
		});
	});

	// One track per requested field, so a field lines up down the list.
	const columnTracks = $derived('auto '.repeat(fields.length).trim());
</script>

<RowList
	items={rows}
	{onedit}
	{columnTracks}
	dotColor={(t) => categoryVar(t.category)}
	dateOf={showDate ? (t) => t.date : undefined}
>
	{#snippet main(t)}
		<TxnMain {t} />
	{/snippet}
	{#snippet columns(t)}
		{#each fields as f (f)}<MetaCol text={column(t, f)} />{/each}
	{/snippet}
	{#snippet amount(t)}
		<Amount value={t.amount} sign="refund" />
	{/snippet}
</RowList>
