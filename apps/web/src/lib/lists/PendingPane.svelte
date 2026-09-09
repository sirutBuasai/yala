<script lang="ts">
	// The pending queue as a board pane: fronted money, waiting to be paid back.
	//
	// One component for both places it appears — the Home hub (every month) and Activity · Month (one
	// month) — which previously carried two near-identical copies of this markup that had already
	// drifted on the tally and the add button. The caller supplies the already-scoped rows, so the
	// scoping stays where the scope is known.
	import Cell from '$lib/layout/grid/Cell.svelte';
	import TransactionList, { type TxnRow } from '$lib/lists/TransactionList.svelte';
	import Empty from '$lib/ui/Empty.svelte';
	import { money } from '$lib/utils/format';

	interface Props {
		/** Pane id in the board's layout. */
		id: string;
		transactions: TxnRow[];
		onedit: (locator: string) => void;
		cap?: string;
		/** Offered beside the tally where this pane is also the page's "log something" home. */
		onadd?: () => void;
	}
	let { id, transactions, onedit, cap, onadd }: Props = $props();

	const total = $derived(transactions.reduce((s, t) => s + t.amount, 0));
</script>

<!-- It stays put on a clean month because it hosts the add button: the empty state then reads as
     reassurance rather than as absence. -->
<Cell {id} title="Pending transactions" {cap} tone="attention">
	{#snippet actions()}
		<div class="pactions">
			{#if transactions.length}
				<span class="meta">{transactions.length} · {money(total)} out</span>
			{/if}
			{#if onadd}
				<button class="btn-ghost" onclick={onadd}>+ Add entry</button>
			{/if}
		</div>
	{/snippet}
	{#if transactions.length}
		<TransactionList {transactions} {onedit} fields={['source']} />
	{:else}
		<Empty>Nothing pending — you're all reconciled.</Empty>
	{/if}
</Cell>

<style>
	.pactions {
		display: flex;
		gap: var(--gap-row);
		align-items: center;
		flex-wrap: wrap;
	}
	.meta {
		color: var(--ink-3);
		font-size: var(--text-secondary);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
</style>
