<script lang="ts">
	// The pending queue as a board pane: fronted money, waiting to be paid back. One component for
	// every place it appears; the caller supplies already-scoped rows, so scoping stays where the
	// scope is known.
	import Pane from '$lib/layout/grid/Pane.svelte';
	import type { Label } from '$lib/ui/label';
	import TransactionList, { type TxnRow } from '$lib/lists/TransactionList.svelte';
	import Empty from '$lib/ui/Empty.svelte';
	import { money } from '$lib/utils/format';
	import { sumBy } from '$lib/utils/num';
	import { words } from '$lib/ui/label';

	interface Props {
		/** Pane id in the board's layout. */
		id: string;
		transactions: TxnRow[];
		onedit: (locator: string) => void;
		caption?: Label;
	}
	let { id, transactions, onedit, caption }: Props = $props();

	const total = $derived(sumBy(transactions, (t) => t.amount));
</script>

<Pane {id} title={words('Pending transactions')} {caption} tone="attention">
	{#snippet actions()}
		{#if transactions.length}
			<span class="meta">{transactions.length} · {money(total)} out</span>
		{/if}
	{/snippet}
	{#if transactions.length}
		<TransactionList {transactions} {onedit} fields={['source']} />
	{:else}
		<Empty>Nothing pending.</Empty>
	{/if}
</Pane>

<style>
	.meta {
		color: var(--ink-3);
		font-size: var(--text-secondary);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
</style>
