<script lang="ts">
	// Reusable pending-queue card. Presentational: the caller supplies the (already-scoped) rows —
	// all months on Home, one month on the Activity / Monthly views — so the same pane works
	// everywhere. Rows are clickable in edit mode to open the reconcile editor.
	import TransactionList, { type TxnRow } from '$lib/lists/TransactionList.svelte';
	import Empty from '$lib/layout/Empty.svelte';
	import Pane from '$lib/layout/Pane.svelte';
	import { money } from '$lib/utils/format';

	interface Props {
		transactions: TxnRow[];
		edit: boolean;
		onedit: (locator: string) => void;
		/** Sub-caption under the title (e.g. name the scope: "across all months" / "this month"). */
		caption?: string;
	}
	let {
		transactions,
		edit,
		onedit,
		caption = 'Fronted entries — tap one to reconcile'
	}: Props = $props();

	const total = $derived(transactions.reduce((s, t) => s + t.amount, 0));
</script>

<div class="pendcard">
	<Pane title="Waiting to be reconciled" cap={caption}>
		{#snippet actions()}
			{#if transactions.length}
				<span class="meta">{transactions.length} · {money(total)} out</span>
			{/if}
		{/snippet}
		{#if transactions.length}
			<TransactionList {transactions} {edit} {onedit} fields={['source']} />
		{:else}
			<Empty>Nothing pending — you're all reconciled.</Empty>
		{/if}
	</Pane>
</div>

<style>
	/* Gold-tinted border marks this as the "needs attention" pane. Pane renders the .card itself,
	   so reach into it from this wrapper. */
	.pendcard :global(.card) {
		border-color: color-mix(in srgb, var(--gold) 32%, var(--border));
	}
	.meta {
		color: var(--ink-3);
		font-size: var(--text-secondary);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
</style>
