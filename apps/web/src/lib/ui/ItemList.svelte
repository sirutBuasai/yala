<script lang="ts">
	// A stack of managed things — categories, bank accounts, investments — each an inset row with its
	// name on the left and its controls on the right. The list supplies the stack and the row chrome so
	// the three call sites can't drift; `ItemRow` is the row itself, exported alongside.
	//
	// The empty state is part of the list on purpose: "no categories yet" is the same statement in the
	// same voice wherever it appears, and making the caller write it invited three wordings.
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
