<script module lang="ts">
	interface TransferRow {
		locator: string;
		date: string;
		payee: string;
		amount: number;
		from_account: string;
		to_account: string;
		pending: boolean;
	}
</script>

<script lang="ts">
	import { money, formatAccount } from '$lib/utils/format';
	import { accountVar } from '$lib/utils/theme';
	import RowList from '$lib/lists/RowList.svelte';
	import Amount from '$lib/ui/Amount.svelte';
	import Badge from '$lib/ui/Badge.svelte';

	interface Props {
		transfers: TransferRow[];
		edit: boolean;
		onedit: (locator: string) => void;
		showDate?: boolean;
		/** Fix the list to this many rows tall, then scroll (see RowList). */
		fixedRows?: number;
		/** Remembers this list's expanded state (see RowList). */
		prefKey?: string;
	}
	let { transfers, edit, onedit, showDate = true, fixedRows, prefKey }: Props = $props();
</script>

<!-- No metadata columns: the route IS the row's detail, and it lives in `main`. -->
<RowList
	items={transfers}
	{edit}
	{onedit}
	{fixedRows}
	{prefKey}
	dotColor={(t) => accountVar(t.from_account)}
	dateOf={showDate ? (t) => t.date : undefined}
>
	{#snippet main(t)}
		<span class="main">
			<span class="title">
				<span class="route">{formatAccount(t.from_account)} → {formatAccount(t.to_account)}</span>
				{#if t.pending}<Badge tone="warn" dot>pending</Badge>{/if}
			</span>
			{#if t.payee}<span class="note">{t.payee}</span>{/if}
		</span>
	{/snippet}
	{#snippet amount(t)}
		<Amount value={t.amount} />
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
	.route {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		min-width: 0;
	}
	.note {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--ink-3);
		font-size: var(--text-badge);
	}
</style>
