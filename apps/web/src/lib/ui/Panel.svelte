<script lang="ts">
	// A settings panel: a small heading, an optional count beside it, an optional explanatory line,
	// then whatever the panel is for. The quieter sibling of `Pane` — Pane is a dashboard figure with
	// a serif title, this is a form block in a column of form blocks.
	//
	// Its vertical rhythm comes from a flex gap rather than from the browser's default <p> margins,
	// which is why every panel spaces the same way regardless of what its children happen to be.
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		/** A tally shown beside the title — "Existing categories 11". */
		count?: number;
		/** One line explaining what the panel is for, or what it will do. */
		cap?: string;
		children: Snippet;
	}
	let { title, count, cap, children }: Props = $props();
</script>

<section class="card compact panel">
	<h3>
		{title}{#if count !== undefined}&nbsp;<span class="count">{count}</span>{/if}
	</h3>
	{#if cap}<p class="cap">{cap}</p>{/if}
	{@render children()}
</section>

<style>
	.panel {
		display: flex;
		flex-direction: column;
		gap: var(--gap-row);
		margin-bottom: var(--space-6);
		max-width: 34rem;
	}
	.panel h3 {
		margin: 0;
		font-size: var(--text-control);
		font-weight: var(--fw-semibold);
		color: var(--ink);
	}
	.count {
		color: var(--ink-3);
		font-weight: var(--fw-medium);
	}
</style>
