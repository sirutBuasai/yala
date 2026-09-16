<script lang="ts">
	// The outcome line under a write control: error, else confirmation, else the caller's resting
	// hint. Paired with `SaveState` so every control reports in the same place with the same roles
	// (`alert` vs `status`).
	import type { Snippet } from 'svelte';
	import type { SaveState } from '$lib/forms/saveState.svelte';

	interface Props {
		/** Not named `state`: a variable of that name makes Svelte read `$state` as a store access. */
		save: SaveState;
		/** Shown when there is neither an error nor a confirmation. */
		fallback?: Snippet;
	}
	let { save, fallback }: Props = $props();
</script>

{#if save.error}
	<span class="err" role="alert">{save.error}</span>
{:else if save.note}
	<span class="note" role="status">{save.note}</span>
{:else if fallback}
	<span class="note">{@render fallback()}</span>
{/if}

<style>
	/* The colours come from the shared `.err` / `.cap` voices; only the placement is local. */
	.err,
	.note {
		display: block;
		margin-top: var(--space-4);
		font-size: var(--text-caption);
	}
	.note {
		color: var(--ink-3);
	}
</style>
