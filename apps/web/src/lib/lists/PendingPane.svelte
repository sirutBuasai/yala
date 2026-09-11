<script lang="ts">
	// The pending queue as a board pane: fronted money, waiting to be paid back. One component for
	// every place it appears; the caller supplies already-scoped rows, so scoping stays where the
	// scope is known.
	import Pane from '$lib/layout/grid/Pane.svelte';
	import TransactionList, { type TxnRow } from '$lib/lists/TransactionList.svelte';
	import Empty from '$lib/ui/Empty.svelte';
	import { money } from '$lib/utils/format';
	import { sumBy } from '$lib/utils/num';

	interface Props {
		/** Pane id in the board's layout. */
		id: string;
		transactions: TxnRow[];
		onedit: (locator: string) => void;
		caption?: string;
		/** Offered beside the tally where this pane is also the page's "log something" home. */
		onadd?: () => void;
	}
	let { id, transactions, onedit, caption, onadd }: Props = $props();

	const total = $derived(sumBy(transactions, (t) => t.amount));
</script>

<!-- Stays put on a clean month because it hosts the add button. -->
<Pane {id} title="Pending transactions" {caption} tone="attention">
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
</Pane>

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
