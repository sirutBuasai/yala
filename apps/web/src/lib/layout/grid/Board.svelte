<script lang="ts">
	// The board: one CSS grid, and the dot lattice under it. The grid runs at ZERO gap and every pane
	// insets itself by half a gap instead (see `units.ts`), which is what lets the dots be a single
	// repeating gradient whose spacing IS the snap distance.
	//
	// The lattice is an UNDERLAY, never an overlay: it is this container's background and panes are
	// opaque, so the dots read through the gap lanes without ever sitting on top of content.
	import type { Snippet } from 'svelte';
	import { Arrangement } from './arrangement.svelte';
	import { getGridEnv, setArrangement } from './context';
	import { UNIT } from './units';
	import type { BoardLayout } from './types';

	interface Props {
		/** Storage key for this board. Every view AND RANGE is its own board, since they hold different
		    figures. */
		key: string;
		layout: BoardLayout;
		children: Snippet;
	}
	let { key, layout, children }: Props = $props();

	const env = getGridEnv();
	// Constructed once: the key and the layout are IDENTITY, not state. Each view and range renders its
	// own component, and re-keying a live preference would orphan whatever was stored under the old key.
	// A view may hand this a `$derived` table, since a figure's caption reads the data; only the geometry
	// half is read, and that half is static.
	// svelte-ignore state_referenced_locally
	const arrangement = new Arrangement(key, layout, env);
	setArrangement(arrangement);
</script>

{#if env.arranging}
	<!-- Beside the board rather than in the page header, because it acts on THIS board. -->
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
		/* Zero gap, deliberately — panes inset themselves. */
		gap: 0;
		grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
		grid-auto-rows: var(--unit);
		margin-bottom: var(--space-9);
	}
	/* Dots on the snap lines, not in the middle of cells: the tile is one unit square with the dot at
	   its centre, so the background is shifted back by half a unit to land it on the intersections. */
	.board.arranging {
		background-image: radial-gradient(circle at center, var(--ink-3) 1.1px, transparent 1.2px);
		background-size: var(--unit) var(--unit);
		background-position: calc(var(--unit) / -2) calc(var(--unit) / -2);
	}
	/* Folded: coordinates are dropped, rows size to their content, and each cell takes its place from
	   the arrangement's reading order (a CSS `order`). */
	.board.folded {
		grid-auto-rows: auto;
		align-items: start;
	}
</style>
