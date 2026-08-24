<script lang="ts">
	// The universal dashboard card: title + subtitle + a body slot for any Figure. What
	// differs between a stat and a chart lives in the body, not the card.
	import type { Snippet } from 'svelte';
	interface Props {
		title?: string;
		cap?: string;
		children: Snippet;
	}
	let { title, cap, children }: Props = $props();
</script>

<section class="card">
	{#if title}<h2 class="serif">{title}</h2>{/if}
	{#if cap}<p class="cap">{cap}</p>{/if}
	<div class="body">{@render children()}</div>
</section>

<style>
	/* Flex column so a chart in the body can grow to fill a stretched pane's height. */
	.card {
		display: flex;
		flex-direction: column;
	}
	.body {
		flex: 1 1 auto;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}
</style>
