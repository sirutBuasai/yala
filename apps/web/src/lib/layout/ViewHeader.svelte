<script lang="ts">
	// The per-page header: a serif title, the page's own controls, and the theme toggle at the far right.
	import type { Snippet } from 'svelte';
	import ThemeToggle from '$lib/nav/ThemeToggle.svelte';

	interface Props {
		title: string;
		children?: Snippet;
	}
	let { title, children }: Props = $props();
</script>

<div class="viewhead">
	<h2 class="serif">{title}</h2>
	{@render children?.()}
	<span class="theme"><ThemeToggle /></span>
</div>

<style>
	.viewhead {
		display: flex;
		align-items: center;
		gap: var(--gap-grid);
		margin-bottom: var(--space-8);
		flex-wrap: wrap;
	}
	.viewhead h2 {
		font-size: var(--text-title);
		font-weight: var(--fw-semibold);
		margin: 0;
	}
	.theme {
		margin-left: auto;
	}
</style>
