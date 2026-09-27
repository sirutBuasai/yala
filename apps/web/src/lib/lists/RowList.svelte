<script lang="ts" generics="T extends { locator: string }">
	// Shared by the transaction, paycheck and transfer lists; callers supply the column template and divergent
	// cells. The pane owns the height, so an overrunning list scrolls inside it.
	import { monthDay } from '$lib/utils/format';
	import type { Snippet } from 'svelte';
	import Dot from '$lib/charts/marks/Dot.svelte';

	interface Props {
		items: T[];
		/** Supply to make rows clickable — they open the relevant editor. Omit for a read-only list. */
		onedit?: (locator: string) => void;
		/** grid-template-columns for the MIDDLE columns only — one track per column the `columns`
		    snippet renders. The date, dot, main and amount tracks are RowList's own. */
		columnTracks?: string;
		dotColor: (item: T) => string;
		/** ISO date for the leading date cell; omit the accessor to hide the date column. */
		dateOf?: (item: T) => string;
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

	const clickable = $derived(!!onedit);

	// The amount track is a floor, not a width, which clipped large totals. The payee's min-content floor makes
	// the row report a real shortfall; crushable to zero, the payee silently vanished.
	const template = $derived(
		[
			dateOf ? 'var(--col-date)' : '',
			'var(--col-dot)',
			'minmax(var(--col-main-floor, min-content), 1fr)',
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
			data-measure
			type={clickable ? 'button' : undefined}
			role={clickable ? 'button' : undefined}
			onclick={clickable ? () => onedit?.(item.locator) : undefined}
		>
			{#if dateOf}<span class="date">{monthDay(dateOf(item))}</span>{/if}
			<Dot color={dotColor(item)} />
			{@render main(item)}
			<!-- `display: contents` keeps each middle column its own grid track while giving the group
			     one switch: at narrow widths the wrapper goes `display: none` and the tracks collapse. -->
			{#if columns}<span class="cols">{@render columns(item)}</span>{/if}
			<span class="amtcell">{@render amount(item)}</span>
		</svelte:element>
	{/each}
</div>

<style>
	.list {
		display: flex;
		flex-direction: column;
		/* Size-container so rows react to the PANE's width, not the viewport. */
		container-type: inline-size;
		/* .bleed-x pulls the list to the card's edges for a full-bleed hover; each row's
		   --pad-card-x padding restores the content inset. */
	}
	.cols {
		display: contents;
	}
	/* Bug: auto-placement counts laid-out children, so when the metadata group hid itself the amount
	   slid into its now zero-width track and rendered squashed mid-row. Pin it to the last track. */
	.amtcell {
		grid-column: -2 / -1;
		display: flex;
		justify-content: flex-end;
		min-width: 0;
	}
	/* Too narrow for all three: drop the metadata, never the payee or the amount. */
	@container (max-width: 26rem) {
		.cols {
			display: none;
		}
	}
	/* Past the row's min-content, where the pane can't grow, the payee truncates rather than pushing the amount
	   out. A custom property, since the template is an inline style. */
	@container (max-width: 20rem) {
		.row {
			--col-main-floor: 0;
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
	/* Divider stays inset to the content while the row hover runs full-bleed. */
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
		background: color-mix(in srgb, var(--lav-wash) calc(9% * var(--wash-scale)), transparent);
	}
	.date {
		color: var(--ink-3);
		font-size: var(--text-meta);
		font-variant-numeric: tabular-nums;
	}
</style>
