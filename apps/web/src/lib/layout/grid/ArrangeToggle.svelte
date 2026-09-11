<script lang="ts">
	// Turns edit mode on for the board on screen — where panes move and resize, and cards are renamed.
	// Page-level, not per-board, and deliberately transient — see `GridEnv.arrangeRequested`. Absent
	// rather than disabled when the full content column doesn't fit: a folded board has no arrangement
	// on screen to edit.
	import Panes from '$lib/icons/Panes.svelte';
	import { getGridEnv } from './context';

	const env = getGridEnv();
</script>

{#if env.canArrange}
	<button
		class="pill arrange"
		class:active={env.arrangeRequested}
		aria-pressed={env.arrangeRequested}
		onclick={() => (env.arrangeRequested = !env.arrangeRequested)}
	>
		<Panes />
		Edit
	</button>
{/if}

<style>
	.arrange {
		display: inline-flex;
		align-items: center;
		gap: var(--gap-inline);
	}
</style>
