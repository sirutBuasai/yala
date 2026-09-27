<script lang="ts">
	// Folded onto a narrow screen, a chart drawn to a fixed geometry keeps a readable width and scrolls
	// sideways, rather than shrinking its type. On the grid the pane's own floor already does that job.
	import type { Snippet } from 'svelte';
	import { tryGridEnv } from '$lib/layout/grid/context';

	interface Props {
		/** px; absent for a chart that reflows to any width. */
		min?: number;
		children: Snippet;
	}
	let { min, children }: Props = $props();

	const env = tryGridEnv();
	const holds = $derived(min !== undefined && !!env?.folded);
</script>

{#if holds}
	<div class="legible scroller-x">
		<div class="room" style:min-width="{min}px">{@render children()}</div>
	</div>
{:else}
	{@render children()}
{/if}

<style>
	.legible {
		min-width: 0;
	}
	.room {
		display: flex;
		flex-direction: column;
	}
</style>
