<script lang="ts" generics="T extends { locator: string }">
	// Shared skeleton for the transaction / paycheck lists: a bleed-to-edge list of grid rows
	// (date? · dot · main · N columns · amount) with the row hover, divider, and edit-mode
	// click behaviour. Callers supply the column template and snippets for the divergent cells.
	import { untrack, type Snippet } from 'svelte';
	import { monthDay } from '$lib/utils/format';
	import { oneOf, Pref } from '$lib/utils/persist.svelte';

	interface Props {
		items: T[];
		/** Edit mode: rows become clickable to open the relevant editor. */
		edit?: boolean;
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
		/** Fix the list to exactly this many rows tall (scroll past it); height from a row-height
		    token. Constant whether the list has fewer rows (blank space) or more (scrolls). */
		fixedRows?: number;
		/** Remembers whether this list was expanded, under `yala-expanded-<prefKey>`. Only meaningful
		    alongside `fixedRows`; omit it and expansion resets with the page. */
		prefKey?: string;
		main: Snippet<[T]>;
		/** Metadata columns between the main text and the amount. Omit for a two-part row. */
		columns?: Snippet<[T]>;
		amount: Snippet<[T]>;
	}
	let {
		items,
		edit = false,
		onedit,
		columnTracks,
		dotColor,
		dateOf,
		density = 'compact',
		fixedRows,
		prefKey,
		main,
		columns,
		amount
	}: Props = $props();

	// Whether this list is showing all its rows. Persisted when the caller names it: a list you
	// expanded to read is one you probably want expanded next time too. Stored as 'on'/'off' rather
	// than a boolean so a stale value is validated by the same `oneOf` as every other preference.
	// `untrack` because the storage key is identity, not state — it is a literal at every call site,
	// and re-keying a live preference would silently orphan whatever was already stored under it.
	// (Same reason Select and DatePicker untrack their `id`.)
	const expanded = new Pref<'on' | 'off'>(
		`expanded-${untrack(() => prefKey) ?? 'anonymous'}`,
		'off',
		oneOf(['on', 'off'] as const)
	);
	// Without a prefKey the expansion is session-scoped, so it must not read a shared stored value.
	let localExpanded = $state(false);
	const isExpanded = $derived(prefKey ? expanded.value === 'on' : localExpanded);

	function toggle() {
		if (prefKey) expanded.value = isExpanded ? 'off' : 'on';
		else localExpanded = !isExpanded;
	}

	// The control only earns its place when there is actually something hidden.
	const capped = $derived(fixedRows != null && items.length > fixedRows);

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

<div
	class="list bleed-x"
	class:comfortable={density === 'comfortable'}
	class:fixed={fixedRows != null && !isExpanded}
	class:scroller={fixedRows != null && !isExpanded}
	style:--rows={fixedRows}
>
	{#each items as item (item.locator)}
		<svelte:element
			this={edit ? 'button' : 'div'}
			class="row"
			class:clickable={edit}
			style:grid-template-columns={template}
			type={edit ? 'button' : undefined}
			role={edit ? 'button' : undefined}
			onclick={edit ? () => onedit?.(item.locator) : undefined}
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

{#if capped}
	<!-- A capped list scrolls internally, which is easy to miss and impossible on a page you're
	     printing or reading top-to-bottom. This says how many rows are being held back and lets you
	     have them. aria-expanded ties the control to the state it changes. -->
	<button type="button" class="btn-mini expander" aria-expanded={isExpanded} onclick={toggle}>
		{isExpanded ? 'Show fewer' : `Show all ${items.length}`}
	</button>
{/if}

<style>
	.list {
		display: flex;
		flex-direction: column;
		--rowh: var(--listrow-h);
		/* Size-container so a row reacts to the PANE it's in, not the viewport: the same list is
		   full-width on one tab and in a 20rem rail on another, and only the container knows. */
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
	.list.comfortable {
		--rowh: var(--listrow-h-comfortable);
	}
	/* Fixed-height list: exactly fixedRows rows tall — blank space when there are fewer, scrolls
	   when there are more (vertical scrolling and its slim scrollbar come from the shared
	   `.scroller`). overflow-x stays hidden so the edge-to-edge bleed never triggers a horizontal
	   scrollbar (rows already fill the bled width exactly). */
	.list.fixed {
		height: calc(var(--rowh) * var(--rows));
		overflow-x: hidden;
	}
	/* Fixing the height exists to hold two side-by-side panes to the same height. Once the panes
	   stack there is no neighbour to match, so reserving empty rows is just a hole in the page —
	   hug the rows instead, while still capping how far the list may scroll. */
	@container (max-width: 26rem) {
		.list.fixed {
			height: auto;
			max-height: calc(var(--rowh) * var(--rows));
		}
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
	/* Sits under the list, aligned to the card's content inset (the list itself is bled out to the
	   card's edges, so it can't be the anchor). */
	.expander {
		margin-top: var(--gap-row);
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
