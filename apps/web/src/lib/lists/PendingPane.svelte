<script lang="ts">
	// Reusable pending-queue card. Presentational: the caller supplies the (already-scoped) rows —
	// all months on Home, one month on the Activity / Monthly views — so the same pane works
	// everywhere. Rows are clickable in edit mode to open the reconcile editor.
	import TransactionList, { type TxnRow } from '$lib/lists/TransactionList.svelte';
	import Empty from '$lib/ui/Empty.svelte';
	import Pane from '$lib/ui/Pane.svelte';
	import { money } from '$lib/utils/format';

	interface Props {
		transactions: TxnRow[];
		edit: boolean;
		onedit: (locator: string) => void;
		/** Fix the list to this many rows tall, then scroll (see RowList). */
		fixedRows?: number;
		/** Remembers this list's expanded state (see RowList). */
		prefKey?: string;
	}
	let { transactions, edit, onedit, fixedRows, prefKey }: Props = $props();

	const total = $derived(transactions.reduce((s, t) => s + t.amount, 0));
</script>

<Pane title="Pending transactions" tone="attention">
	{#snippet actions()}
		{#if transactions.length}
			<span class="meta">{transactions.length} · {money(total)} out</span>
		{/if}
	{/snippet}
	{#if transactions.length}
		<TransactionList {transactions} {edit} {onedit} {fixedRows} {prefKey} fields={['source']} />
	{:else}
		<Empty>Nothing pending — you're all reconciled.</Empty>
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
