<script lang="ts">
	// A stack of managed things, each an inset row with its name left and its controls right.
	// `ItemRow` is the row itself, exported alongside. The empty state belongs to the list so its
	// wording and voice stay identical wherever it appears.
	import type { Snippet } from 'svelte';
	import Empty from '$lib/ui/Empty.svelte';

	interface Props {
		/** Shown instead of the list when it has nothing in it. */
		empty: string;
		/** Whether there is anything to show — the caller knows its own collection. */
		any: boolean;
		children: Snippet;
	}
	let { empty, any, children }: Props = $props();
</script>

{#if any}
	<ul class="items">{@render children()}</ul>
{:else}
	<Empty>{empty}</Empty>
{/if}

<style>
	.items {
		display: flex;
		flex-direction: column;
		gap: var(--gap-row);
		list-style: none;
		margin: 0;
		padding: 0;
	}
</style>
