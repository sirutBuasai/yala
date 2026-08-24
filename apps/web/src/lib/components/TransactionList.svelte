<script lang="ts">
	import type { Txn } from '$lib/types';
	import { money, formatAccount, monthDay } from '$lib/format';
	import { categoryVar } from '$lib/theme';

	interface Props {
		transactions: Txn[];
		/** Edit mode: rows become clickable to open the transaction editor. */
		edit: boolean;
		onedit: (locator: string) => void;
		/** Hide the per-row date (e.g. when the surrounding pane already names the day). */
		showDate?: boolean;
	}
	let { transactions, edit, onedit, showDate = true }: Props = $props();
</script>

<div class="txlist">
	{#each transactions as t (t.locator)}
		<svelte:element
			this={edit ? 'button' : 'div'}
			class="tx"
			class:clickable={edit}
			class:no-date={!showDate}
			type={edit ? 'button' : undefined}
			role={edit ? 'button' : undefined}
			onclick={edit ? () => onedit(t.locator) : undefined}
		>
			{#if showDate}<span class="date">{monthDay(t.date)}</span>{/if}
			<span class="dot" style:background={categoryVar(t.category)}></span>
			<span class="main">
				<span class="title">
					{t.payee}
					{#if t.pending}<span class="pending">● pending</span>{/if}
				</span>
				<span class="cat">{t.category}</span>
			</span>
			<span class="src">{formatAccount(t.source)}</span>
			<span class="amt" class:refund={t.amount < 0}>{money(t.amount)}</span>
		</svelte:element>
	{/each}
</div>

<style>
	.txlist {
		display: flex;
		flex-direction: column;
		/* bleed to the enclosing card's edges (18px 20px padding) so the row hover runs edge-to-edge;
		   the +20px in the row padding below keeps the text where it was. */
		margin: 0 -20px;
	}
	.tx {
		position: relative;
		display: grid;
		grid-template-columns: 34px 10px 1fr auto 74px;
		align-items: center;
		gap: 10px;
		padding: 8px 24px;
		/* reset button defaults for the clickable (edit-mode) variant */
		width: 100%;
		background: none;
		border: 0;
		color: inherit;
		font: inherit;
		text-align: left;
	}
	/* divider stays inset to the content (the +20px bleed offset), while the row hover is full-bleed */
	.tx:not(:last-child)::after {
		content: '';
		position: absolute;
		left: 20px;
		right: 20px;
		bottom: 0;
		height: 1px;
		background: var(--border);
	}
	.tx.no-date {
		grid-template-columns: 10px 1fr auto 74px;
	}
	.main {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	/* full-width square hover (app standard for stacked/list rows) */
	.tx.clickable {
		cursor: pointer;
	}
	.tx.clickable:hover {
		background: color-mix(in srgb, var(--lav) 9%, transparent);
	}
	.date {
		color: var(--ink-3);
		font-size: 11.5px;
		font-variant-numeric: tabular-nums;
	}
	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
	}
	.title {
		font-size: 13px;
		font-weight: 500;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.pending {
		color: var(--gold-text);
		font-size: 10.5px;
		font-weight: 600;
		margin-left: 6px;
		white-space: nowrap;
	}
	.cat {
		color: var(--ink-3);
		font-size: 10.5px;
	}
	.src {
		color: var(--ink-2);
		font-size: 11.5px;
		white-space: nowrap;
	}
	.amt {
		text-align: right;
		font-variant-numeric: tabular-nums;
		font-weight: 600;
		font-size: 13px;
	}
	.amt.refund {
		color: var(--good-text);
	}
</style>
