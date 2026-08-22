<script lang="ts">
	import type { Snippet } from 'svelte';
	interface Props {
		title: string;
		cap?: string;
		children: Snippet;
	}
	let { title, cap, children }: Props = $props();
</script>

<section class="card">
	<h2 class="serif">{title}</h2>
	{#if cap}<p class="cap">{cap}</p>{/if}
	{@render children()}
</section>
