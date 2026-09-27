<script lang="ts">
	// Rebuilds `BoardGrid` when the pane set changes, since the arrangement derives its ids at construction.
	// Keyed on the ids alone, so a caption change doesn't throw the board away.
	import { onMount, type Snippet } from 'svelte';
	import BoardGrid from './BoardGrid.svelte';
	import { getGridEnv } from './context';
	import type { BoardLayout } from './types';

	interface Props {
		/** Storage key for this board. Every view and range is its own board, since they hold different
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

	// onMount, not $effect: `boards++` reads the count it writes, so an effect would retrigger itself
	// without end.
	const env = getGridEnv();
	onMount(() => {
		env.boards++;
		return () => env.boards--;
	});
</script>

{#key panes}
	<BoardGrid {key} {layout} {names} {onreset}>{@render children()}</BoardGrid>
{/key}
