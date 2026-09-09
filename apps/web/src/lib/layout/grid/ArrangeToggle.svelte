<script lang="ts">
	// Turns the arrange affordances on for the board on screen. A page-level toggle, not a per-board
	// one: you are either rearranging or reading, and the state is deliberately transient — see
	// `GridEnv.arranging`.
	//
	// Absent, not disabled, when the full content column doesn't fit: a narrower viewport drops the
	// coordinates entirely and folds, so there is no arrangement on screen to edit.
	import Panes from '$lib/icons/Panes.svelte';
	import { getGridEnv } from './context';

	const env = getGridEnv();
</script>

{#if env.canArrange}
	<button
		class="pill arrange"
		class:active={env.arranging}
		aria-pressed={env.arranging}
		onclick={() => (env.arranging = !env.arranging)}
	>
		<Panes />
		Arrange
	</button>
{/if}

<style>
	.arrange {
		display: inline-flex;
		align-items: center;
		gap: var(--gap-inline);
	}
</style>
