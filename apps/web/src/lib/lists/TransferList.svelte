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

	interface Props {
		transfers: TransferRow[];
		edit: boolean;
		onedit: (locator: string) => void;
		showDate?: boolean;
		/** Fix the list to this many rows tall, then scroll (see RowList). */
		fixedRows?: number;
	}
	let { transfers, edit, onedit, showDate = true, fixedRows }: Props = $props();

	const cols = $derived(`${showDate ? '34px ' : ''}10px 1fr auto 74px`);
</script>

<RowList
	items={transfers}
	{edit}
	{onedit}
	{cols}
	{fixedRows}
	dotColor={(t) => accountVar(t.from_account)}
	dateOf={showDate ? (t) => t.date : undefined}
>
	{#snippet main(t)}
		<span class="main">
			<span class="title">
				<span class="route">{formatAccount(t.from_account)} → {formatAccount(t.to_account)}</span>
				{#if t.pending}<span class="pending">● pending</span>{/if}
			</span>
			{#if t.payee}<span class="note">{t.payee}</span>{/if}
		</span>
	{/snippet}
	{#snippet columns(_t)}
		<span></span>
	{/snippet}
	{#snippet amount(t)}
		<span class="amt">{money(t.amount)}</span>
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
	.pending {
		flex: none;
		color: var(--gold-text);
		font-size: var(--text-badge);
		font-weight: var(--fw-semibold);
		margin-left: var(--space-3);
		white-space: nowrap;
	}
	.note {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--ink-3);
		font-size: var(--text-badge);
	}
	.amt {
		text-align: right;
		font-variant-numeric: tabular-nums;
		font-weight: var(--fw-semibold);
		font-size: var(--text-row);
	}
</style>
