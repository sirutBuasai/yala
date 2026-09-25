<script lang="ts">
	// Transactions, paychecks and bill pay in one list, each row drawn with the same parts its own list uses.
	import type { HistoryEntry } from '$lib/lists/history';
	import { formatAccount } from '$lib/utils/format';
	import { accountVar, categoryVar } from '$lib/utils/theme';
	import RowList from '$lib/lists/RowList.svelte';
	import Amount from '$lib/ui/Amount.svelte';
	import TxnMain from '$lib/lists/parts/TxnMain.svelte';
	import TransferMain from '$lib/lists/parts/TransferMain.svelte';
	import PaycheckFigs from '$lib/lists/parts/PaycheckFigs.svelte';
	import PaycheckMain from '$lib/lists/parts/PaycheckMain.svelte';
	import MetaCol from '$lib/lists/parts/MetaCol.svelte';

	interface Props {
		entries: HistoryEntry[];
		onedit: (entry: HistoryEntry) => void;
		/** Hide the per-row date, for a group that already names the day. */
		showDate?: boolean;
	}
	let { entries, onedit, showDate = true }: Props = $props();

	const byLocator = $derived(new Map(entries.map((e) => [e.locator, e])));

	function dotColor(e: HistoryEntry): string {
		if (e.type === 'txn') return categoryVar(e.row.category);
		if (e.type === 'pay') return 'var(--role-income)';
		return accountVar(e.row.from_account);
	}
</script>

<!-- A size container, so a paycheck's figures drop out when the pane is too narrow for them. -->
<div class="history">
	<RowList
		items={entries}
		onedit={(locator) => onedit(byLocator.get(locator)!)}
		columnTracks="auto"
		{dotColor}
		dateOf={showDate ? (e) => e.date : undefined}
	>
		{#snippet main(e)}
			{#if e.type === 'txn'}
				<TxnMain t={e.row} />
			{:else if e.type === 'pay'}
				<PaycheckMain p={e.row} />
			{:else}
				<TransferMain t={e.row} />
			{/if}
		{/snippet}
		{#snippet columns(e)}
			{#if e.type === 'txn'}
				<MetaCol text={formatAccount(e.row.source)} />
			{:else if e.type === 'pay'}
				<PaycheckFigs p={e.row} fields={['gross', 'takehome']} />
			{:else}
				<span></span>
			{/if}
		{/snippet}
		{#snippet amount(e)}
			{#if e.type === 'txn'}
				<Amount value={e.row.amount} sign="refund" />
			{:else if e.type === 'pay'}
				<Amount value={e.row.net} sign="credit" />
			{:else}
				<Amount value={e.row.amount} />
			{/if}
		{/snippet}
	</RowList>
</div>

<style>
	.history {
		container-type: inline-size;
		min-width: 0;
	}
</style>
