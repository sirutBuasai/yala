<script lang="ts">
	// The caller supplies already-scoped rows, so scoping stays where the scope is known.
	import Pane from '$lib/layout/grid/Pane.svelte';
	import type { Label } from '$lib/ui/label';
	import type { HistoryEntry } from '$lib/lists/history';
	import HistoryList from '$lib/lists/HistoryList.svelte';
	import Empty from '$lib/ui/Empty.svelte';
	import { money } from '$lib/utils/format';
	import { sumBy } from '$lib/utils/num';
	import { words } from '$lib/ui/label';

	interface Props {
		/** Pane id in the board's layout. */
		id: string;
		entries: HistoryEntry[];
		onedit: (entry: HistoryEntry) => void;
		caption?: Label;
	}
	let { id, entries, onedit, caption }: Props = $props();

	const total = $derived(sumBy(entries, (e) => (e.type === 'pay' ? 0 : e.row.amount)));
</script>

<Pane {id} title={words('Pending transactions')} {caption} tone="attention">
	{#snippet actions()}
		{#if entries.length}
			<span class="meta">{entries.length} · {money(total)} out</span>
		{/if}
	{/snippet}
	{#if entries.length}
		<HistoryList {entries} {onedit} />
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
