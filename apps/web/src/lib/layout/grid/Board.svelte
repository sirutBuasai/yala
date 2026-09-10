<script lang="ts">
	// The board: one CSS grid, and the dot lattice under it.
	//
	// The grid runs at ZERO gap and every pane insets itself by half a gap instead (see `Pane`).
	// That is what makes the lattice arithmetic hold: one unit is exactly `content / 48`, so a track
	// boundary lands on every multiple of the unit and the dots can be one repeating gradient. Put
	// the gap on the grid and each track becomes `(content − 47·gap) / 48`, which no repeating
	// background can follow — and the dots would stop meaning "this is where it will snap".
	//
	// The lattice is an UNDERLAY, never an overlay: it is this container's background, and panes are
	// opaque, so the dots read through the gap lanes and any empty region without ever sitting on
	// top of content.
	import type { Snippet } from 'svelte';
	import { Arrangement } from './arrangement.svelte';
	import { getGridEnv, setArrangement } from './context';
	import { UNIT } from './units';
	import type { BoardLayout } from './types';

	interface Props {
		/** Storage key for this board. Every view AND RANGE is its own board — Activity·Month and
		    Activity·Year hold different figures, so one arrangement can't serve both. */
		key: string;
		layout: BoardLayout;
		children: Snippet;
	}
	let { key, layout, children }: Props = $props();

	const env = getGridEnv();
	// Constructed once. The key and the layout are IDENTITY, not state: each view and range renders its
	// own component, so a board is never asked to become a different board — and re-keying a live
	// preference would silently orphan whatever was already stored under the old key.
	//
	// A view may hand this a `$derived` table, since a figure's caption reads the data. Only the
	// geometry half is read, and only here, and that half is static — a caption changing does not move
	// a pane, so there is nothing for a later table to tell the board.
	// svelte-ignore state_referenced_locally
	const arrangement = new Arrangement(key, layout, env);
	setArrangement(arrangement);
</script>

{#if env.arranging}
	<!-- Says what the gestures are, and offers the way back. Beside the board rather than in the page
	     header because it acts on THIS board: each view and range keeps its own arrangement. -->
	<div class="hint">
		<span
			>Drag a pane to move it, its edges to resize. A list's buttons set who owns its height.</span
		>
		<button type="button" class="btn-mini" onclick={() => arrangement.reset()}
			>Reset this board</button
		>
	</div>
{/if}

<div
	class="board"
	class:folded={env.folded}
	class:arranging={env.arranging}
	style:--cols={arrangement.columns}
	style:--unit="{UNIT}px"
>
	{@render children()}
</div>

<style>
	.hint {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--gap-field);
		flex-wrap: wrap;
		margin-bottom: var(--gap-row);
		padding: var(--space-3) calc(var(--gap-grid) / 2);
		color: var(--ink-3);
		font-size: var(--text-secondary);
	}
	.board {
		display: grid;
		/* Zero gap, deliberately — see the note above. Panes inset themselves. */
		gap: 0;
		grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
		grid-auto-rows: var(--unit);
		margin-bottom: var(--space-9);
	}
	/* Dots on the snap lines, not in the middle of cells: the tile is one unit square with the dot
	   at its centre, so the whole background is shifted back by half a unit to land the dot on the
	   intersections. Spacing IS the snap distance, by construction. */
	.board.arranging {
		background-image: radial-gradient(circle at center, var(--ink-3) 1.1px, transparent 1.2px);
		background-size: var(--unit) var(--unit);
		background-position: calc(var(--unit) / -2) calc(var(--unit) / -2);
	}
	/* Folded: coordinates are dropped entirely. Rows size to their content and each cell takes its
	   place from the arrangement's reading order (a CSS `order`), so the layout the user built still
	   decides the sequence. */
	.board.folded {
		grid-auto-rows: auto;
		align-items: start;
	}
</style>
