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
		/** Row spacing: 'compact' (default, dense lists) or 'comfortable' (roomier). */
		density?: 'compact' | 'comfortable';
		/** Cap the list to this many rows, then scroll; height comes from a row-height token. */
		maxRows?: number;
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
		density = 'compact',
		maxRows,
		main,
		columns,
		amount
	}: Props = $props();
</script>

<div
	class="list bleed-x"
	class:comfortable={density === 'comfortable'}
	class:capped={maxRows != null}
	style:--max-rows={maxRows}
>
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
		--rowh: var(--listrow-h);
		/* .bleed-x pulls the list to the card's edges so the row hover runs edge-to-edge;
		   each row's --pad-card-x padding restores the content inset. */
	}
	.list.comfortable {
		--rowh: var(--listrow-h-comfortable);
	}
	/* Capped list: show maxRows rows, then scroll. overflow-x stays hidden so the edge-to-edge
	   bleed never triggers a horizontal scrollbar (rows already fill the bled width exactly). */
	.list.capped {
		max-height: calc(var(--rowh) * var(--max-rows));
		overflow-y: auto;
		overflow-x: hidden;
		overscroll-behavior: contain;
	}
	.row {
		position: relative;
		display: grid;
		align-items: center;
		gap: var(--space-5);
		padding: var(--pad-listrow);
		/* reset button defaults for the clickable (edit-mode) variant */
		/* comfortable density (--pad-listrow-comfortable) applied via .comfortable below */
		width: 100%;
		background: none;
		border: 0;
		color: inherit;
		font: inherit;
		text-align: left;
	}
	.comfortable .row {
		padding: var(--pad-listrow-comfortable);
	}
	/* divider stays inset to the content (same anchor as the bleed) while the row hover is full-bleed */
	.row:not(:last-child)::after {
		content: '';
		position: absolute;
		left: var(--pad-card-x);
		right: var(--pad-card-x);
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
		font-size: var(--text-meta);
		font-variant-numeric: tabular-nums;
	}
	.dot {
		width: 8px;
		height: 8px;
		border-radius: var(--radius-pill);
	}
</style>
