<script lang="ts">
	// The per-page header: a serif title and the page's period controls, then at the far right the page's
	// actions beside the app-wide toggles.
	import type { Snippet } from 'svelte';
	import ThemeToggle from '$lib/nav/ThemeToggle.svelte';
	import ArrangeToggle from '$lib/layout/grid/ArrangeToggle.svelte';

	interface Props {
		title: string;
		/** Period controls, beside the title. */
		children?: Snippet;
		/** Page actions such as adding an entry, at the right beside the toggles. */
		actions?: Snippet;
	}
	let { title, children, actions }: Props = $props();
</script>

<div class="viewhead">
	<h2 class="serif">{title}</h2>
	{@render children?.()}
	<span class="toggles">{@render actions?.()}<ArrangeToggle /><ThemeToggle /></span>
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
	.toggles {
		margin-left: auto;
		display: flex;
		gap: var(--gap-row);
	}
</style>
