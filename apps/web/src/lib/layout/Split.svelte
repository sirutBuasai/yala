<script lang="ts">
	// Two-column page row: a wide main column and a narrower rail, collapsing to one column on
	// narrow viewports. `stretch` makes both columns share the taller one's height, which is how a
	// rail pane sizes itself to its neighbour (and then scrolls internally) without measuring
	// anything in JS.
	import type { Snippet } from 'svelte';

	interface Props {
		main: Snippet;
		rail: Snippet;
		/** Match both columns to the taller one's height instead of hugging their own content. */
		stretch?: boolean;
	}
	let { main, rail, stretch = false }: Props = $props();
</script>

<div class="split" class:stretch>
	<div class="col">{@render main()}</div>
	<div class="col">{@render rail()}</div>
</div>

<style>
	.split {
		display: grid;
		/* Override --split-cols on the instance to re-balance a row. */
		grid-template-columns: var(--split-cols, minmax(0, 1.62fr) minmax(20rem, 0.95fr));
		gap: var(--gap-grid);
		align-items: start;
	}
	.split.stretch {
		align-items: stretch;
	}
	/* min-width:0 lets a dense child (table, calendar) shrink instead of forcing the column wider */
	.col {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: var(--gap-grid);
	}
	@media (max-width: 70rem) {
		.split {
			grid-template-columns: 1fr;
		}
	}
</style>
