<script lang="ts" generics="T extends { locator: string }">
	// Shared skeleton for the transaction / paycheck lists: a bleed-to-edge list of grid rows
	// (date? · dot · main · N columns · amount) with the row hover, divider, and edit-mode
	// click behaviour. Callers supply the column template and snippets for the divergent cells.
	import type { Snippet } from 'svelte';
	import { monthDay } from '$lib/utils/format';

	interface Props {
		items: T[];
		/** Edit mode: rows become clickable to open the relevant editor. */
		edit?: boolean;
		onedit?: (locator: string) => void;
		/** grid-template-columns, built by the caller to match its snippet column count. */
		cols: string;
		/** Background of the leading dot for a row. */
		dotColor: (item: T) => string;
		/** ISO date for the leading date cell; omit the accessor to hide the date column. */
		dateOf?: (item: T) => string;
		main: Snippet<[T]>;
		columns: Snippet<[T]>;
		amount: Snippet<[T]>;
	}
	let {
		items,
		edit = false,
		onedit,
		cols,
		dotColor,
		dateOf,
		main,
		columns,
		amount
	}: Props = $props();
</script>

<div class="list">
	{#each items as item (item.locator)}
		<svelte:element
			this={edit ? 'button' : 'div'}
			class="row"
			class:clickable={edit}
			style:grid-template-columns={cols}
			type={edit ? 'button' : undefined}
			role={edit ? 'button' : undefined}
			onclick={edit ? () => onedit?.(item.locator) : undefined}
		>
			{#if dateOf}<span class="date">{monthDay(dateOf(item))}</span>{/if}
			<span class="dot" style:background={dotColor(item)}></span>
			{@render main(item)}
			{@render columns(item)}
			{@render amount(item)}
		</svelte:element>
	{/each}
</div>

<style>
	.list {
		display: flex;
		flex-direction: column;
		/* bleed to the enclosing card's edges (20px h-padding) so the row hover runs edge-to-edge;
		   the +20px in the row padding below keeps the content where it was. */
		margin: 0 -20px;
	}
	.row {
		position: relative;
		display: grid;
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
	/* divider stays inset to the content while the row hover is full-bleed */
	.row:not(:last-child)::after {
		content: '';
		position: absolute;
		left: 20px;
		right: 20px;
		bottom: 0;
		height: 1px;
		background: var(--border);
	}
	.row.clickable {
		cursor: pointer;
	}
	.row.clickable:hover {
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
</style>
