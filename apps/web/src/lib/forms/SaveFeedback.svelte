<script lang="ts">
	// The outcome line under a write control: the error if the last attempt failed, otherwise the
	// confirmation, otherwise whatever resting hint the caller supplies. Paired with `SaveState` so
	// every control reports in the same place, with the same roles (`alert` vs `status`) — screen
	// readers announce a failure immediately and a success politely.
	import type { Snippet } from 'svelte';
	import type { SaveState } from '$lib/forms/saveState.svelte';

	interface Props {
		/** Not named `state`: a variable of that name makes Svelte read `$state` as a store access. */
		save: SaveState;
		/** Shown when there's neither an error nor a confirmation (e.g. "Unset"). */
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
	.err,
	.note {
		display: block;
		margin-top: var(--space-4);
		font-size: var(--text-caption);
	}
	.err {
		color: var(--crit-text);
	}
	.note {
		color: var(--ink-3);
	}
</style>
