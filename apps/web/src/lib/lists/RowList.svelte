<script lang="ts" generics="T extends { locator: string }">
	// Shared skeleton for the transaction / paycheck / transfer lists: a bleed-to-edge list of grid
	// rows (date? · dot · main · N columns · amount) with the row hover, the divider, and the
	// click-to-edit behaviour. Callers supply the column template and snippets for the divergent cells.
	//
	// A list no longer caps itself at N rows and no longer offers a "show all" expander: the PANE owns
	// the height now, so a list that overruns scrolls inside a pane sized for it, and a list you want
	// all of gets a pane set to fit its content. Two mechanisms for one job is one too many, and the
	// old one couldn't express "as tall as this list happens to be" at all.
	import { monthDay } from '$lib/utils/format';
	import type { Snippet } from 'svelte';

	interface Props {
		items: T[];
		/** Supply to make rows clickable — they open the relevant editor. Omit for a read-only list. */
		onedit?: (locator: string) => void;
		/** grid-template-columns for the MIDDLE columns only — one track per column the `columns`
		    snippet renders, so they line up across rows. The date, dot, main and amount tracks are
		    RowList's own, built from tokens, so no caller has to know their widths. */
		columnTracks?: string;
		/** Background of the leading dot for a row. */
		dotColor: (item: T) => string;
		/** ISO date for the leading date cell; omit the accessor to hide the date column. */
		dateOf?: (item: T) => string;
		/** Row spacing: 'compact' (default, dense lists) or 'comfortable' (roomier). */
		density?: 'compact' | 'comfortable';
		main: Snippet<[T]>;
		/** Metadata columns between the main text and the amount. Omit for a two-part row. */
		columns?: Snippet<[T]>;
		amount: Snippet<[T]>;
	}
	let {
		items,
		onedit,
		columnTracks,
		dotColor,
		dateOf,
		density = 'compact',
		main,
		columns,
		amount
	}: Props = $props();

	/** Rows are clickable exactly when there is somewhere for a click to go. */
	const clickable = $derived(!!onedit);

	// The row's ruler. The amount track is a FLOOR, not a width: `max-content` lets a six-figure
	// total take the room it needs and the payee column gives it up, where a fixed 74px simply
	// clipped the figure — the one thing in a row that must never be misread.
	const template = $derived(
		[
			dateOf ? 'var(--col-date)' : '',
			'var(--col-dot)',
			'minmax(0, 1fr)',
			columnTracks ?? '',
			'minmax(var(--col-amount), max-content)'
		]
			.filter(Boolean)
			.join(' ')
	);
</script>

<div class="list bleed-x" class:comfortable={density === 'comfortable'}>
	{#each items as item (item.locator)}
		<svelte:element
			this={clickable ? 'button' : 'div'}
			class="row"
			class:clickable
			style:grid-template-columns={template}
			type={clickable ? 'button' : undefined}
			role={clickable ? 'button' : undefined}
			onclick={clickable ? () => onedit?.(item.locator) : undefined}
		>
			{#if dateOf}<span class="date">{monthDay(dateOf(item))}</span>{/if}
			<span class="dot" style:background={dotColor(item)} aria-hidden="true"></span>
			{@render main(item)}
			<!-- `display: contents` keeps each middle column its own grid track (so they align down
			     the list), while still giving the group ONE switch to turn off: at narrow widths the
			     whole wrapper goes `display: none` and the tracks collapse, rather than the columns
			     squeezing the payee and the amount into illegibility. -->
			{#if columns}<span class="cols">{@render columns(item)}</span>{/if}
			<span class="amtcell">{@render amount(item)}</span>
		</svelte:element>
	{/each}
</div>

<style>
	.list {
		display: flex;
		flex-direction: column;
		/* Size-container so a row reacts to the PANE it's in, not the viewport: the same list is
		   full-width on one tab and half a board wide on another, and only the container knows. */
		container-type: inline-size;
		/* .bleed-x pulls the list to the card's edges so the row hover runs edge-to-edge;
		   each row's --pad-card-x padding restores the content inset. */
	}
	.cols {
		display: contents;
	}
	/* RowList owns the row's tracks, so it owns the amount's CELL too — the caller only supplies
	   what goes in it. The cell is pinned to the last track rather than auto-placed: auto-placement
	   counts laid-out children, so the moment the metadata group hides itself the amount slid up
	   into the metadata's own (now zero-width) track and rendered squashed mid-row. */
	.amtcell {
		grid-column: -2 / -1;
		display: flex;
		justify-content: flex-end;
		min-width: 0;
	}
	/* Too narrow to read a payee, its metadata AND its amount: drop the metadata. The payee and the
	   amount are what a row is FOR, so they are the two things that never go. */
	@container (max-width: 26rem) {
		.cols {
			display: none;
		}
	}
	.row {
		position: relative;
		display: grid;
		align-items: center;
		gap: var(--space-5);
		padding: var(--pad-listrow);
		/* reset button defaults for the clickable variant */
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
