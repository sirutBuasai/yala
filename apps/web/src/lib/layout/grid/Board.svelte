<script lang="ts">
	// A view's board. All this adds over `BoardGrid` is the rebuild: merging two KPI cards changes
	// which panes the board HAS, and the arrangement derives its ids from the layout at construction,
	// so it is rebuilt when that set changes rather than being left reserving rows for a pane nobody
	// renders any more. Keyed on the ids alone — a caption changing must not throw the board away.
	import type { Snippet } from 'svelte';
	import BoardGrid from './BoardGrid.svelte';
	import type { BoardLayout } from './types';

	interface Props {
		/** Storage key for this board. Every view AND RANGE is its own board, since they hold different
		    figures. */
		key: string;
		layout: BoardLayout;
		/** Renameable ids beyond the panes — every KPI id on this board. See `BoardGrid`. */
		names?: string[];
		/** Also clear whatever else the view stores about this board — its KPI merges, say. */
		onreset?: () => void;
		children: Snippet;
	}
	let { key, layout, names, onreset, children }: Props = $props();

	const panes = $derived(Object.keys(layout).join(' '));
</script>

{#key panes}
	<BoardGrid {key} {layout} {names} {onreset}>{@render children()}</BoardGrid>
{/key}
