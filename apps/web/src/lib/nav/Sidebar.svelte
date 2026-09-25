<script lang="ts">
	// The docked sidebar: brand, quick add, the pages, and the app-wide toggles.
	import Brand from '$lib/nav/Brand.svelte';
	import NavLinks from '$lib/nav/NavLinks.svelte';
	import ThemeToggle from '$lib/nav/ThemeToggle.svelte';
	import { DEV_PAGE, PAGES } from '$lib/nav/pages';
	import { SIDEBAR_W } from '$lib/nav/sidebar';

	interface Props {
		onadd: () => void;
	}
	let { onadd }: Props = $props();
</script>

<aside class="sidebar" style:width="{SIDEBAR_W}px">
	<div class="lead">
		<Brand />
		<button class="btn-accent pill" onclick={onadd}>+ Add entry</button>
	</div>
	<NavLinks links={PAGES} ariaLabel="Pages" />
	<div class="foot">
		<NavLinks links={[DEV_PAGE]} ariaLabel="Tools" />
		<div class="toggles"><ThemeToggle /></div>
	</div>
</aside>

<style>
	.sidebar {
		position: sticky;
		top: 0;
		height: 100vh;
		flex: none;
		display: flex;
		flex-direction: column;
		gap: var(--gap-row);
		/* No horizontal padding: children set their own, so the full-width link hover reaches the edges. */
		padding: var(--space-11) 0 var(--space-8);
		background: var(--surface);
		border-right: 1px solid var(--border);
		overflow-y: auto;
	}
	.lead {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-8);
		padding: 0 var(--space-9) var(--space-8);
	}
	.foot {
		margin-top: auto;
		display: flex;
		flex-direction: column;
		gap: var(--gap-row);
		border-top: 1px solid var(--border);
		padding-top: var(--space-4);
	}
	.toggles {
		padding: 0 var(--space-9);
	}
</style>
