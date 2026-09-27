<script lang="ts">
	// Zero grid gap, each pane insetting by half a gap (see `units.ts`), so the dot lattice is one repeating
	// gradient whose spacing is the snap distance.
	import type { Snippet } from 'svelte';
	import { Arrangement } from './arrangement.svelte';
	import { BoardLabels } from './labels';
	import { getGridEnv, setArrangement, setLabels } from './context';
	import { UNIT } from './units';
	import type { BoardLayout } from './types';

	interface Props {
		key: string;
		layout: BoardLayout;
		/** Renameable ids beyond the panes themselves — a KPI card's sections each carry their own. Omit
		    only for a board with no KPI cards, or their names are read as belonging to nothing and dropped. */
		names?: string[];
		/** Also clear whatever else the view stores about this board — its KPI merges, say. */
		onreset?: () => void;
		children: Snippet;
	}
	let { key, layout, names, onreset, children }: Props = $props();

	const env = getGridEnv();
	// Constructed once: only the geometry half is read, and it changes only with the pane set, which remounts
	// this component.
	// svelte-ignore state_referenced_locally
	const arrangement = new Arrangement(key, layout, env);
	setArrangement(arrangement);

	// Stored apart from the arrangement, so a board's renames survive a change to its pane set.
	// svelte-ignore state_referenced_locally
	const labels = new BoardLabels(key, [...Object.keys(layout), ...(names ?? [])]);
	setLabels(labels);

	function reset() {
		arrangement.reset();
		labels.reset();
		onreset?.();
	}
</script>

{#if env.arranging}
	<!-- Beside the board rather than in the page header, because it acts on THIS board. -->
	<div class="actions">
		<button type="button" class="btn-mini" onclick={reset}>Reset this board</button>
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
	.actions {
		display: flex;
		justify-content: flex-end;
		margin-bottom: var(--gap-row);
		padding: var(--space-3) calc(var(--gap-grid) / 2);
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
