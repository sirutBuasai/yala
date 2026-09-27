<script lang="ts">
	// Page-level and transient (see `GridEnv.arrangeRequested`). Absent, not disabled, on a folded board, which
	// has no arrangement to edit.
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
