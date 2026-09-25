<script lang="ts">
	// The docked sidebar: brand, the pages, and the development gallery at the foot. As a rail it keeps a
	// slot of the rail's width in the page and expands over the content on hover or keyboard focus, so
	// opening it never reflows the board.
	import Brand from '$lib/nav/Brand.svelte';
	import NavLinks from '$lib/nav/NavLinks.svelte';
	import { DEV_PAGE, PAGES } from '$lib/nav/pages';
	import { RAIL_W, SIDEBAR_W } from '$lib/nav/sidebar';

	let { rail }: { rail: boolean } = $props();
</script>

<div class="slot" style:width="{rail ? RAIL_W : SIDEBAR_W}px">
	<aside class="sidebar" class:rail style:--open-w="{SIDEBAR_W}px" style:--rail-w="{RAIL_W}px">
		<div class="lead">
			<Brand />
		</div>
		<NavLinks links={PAGES} ariaLabel="Pages" />
		<div class="foot">
			<NavLinks links={[DEV_PAGE]} ariaLabel="Tools" />
		</div>
	</aside>
</div>

<style>
	.slot {
		position: sticky;
		top: 0;
		height: 100vh;
		flex: none;
		z-index: 30;
	}
	.sidebar {
		height: 100%;
		width: var(--open-w);
		display: flex;
		flex-direction: column;
		gap: var(--gap-row);
		/* No horizontal padding: children set their own, so the full-width link hover reaches the edges. */
		padding: var(--space-11) 0 var(--space-8);
		background: var(--surface);
		border-right: 1px solid var(--border);
		overflow-x: hidden;
		overflow-y: auto;
	}
	.rail {
		width: var(--rail-w);
		transition: width 160ms ease-out;
	}
	.rail:hover,
	.rail:focus-within {
		width: var(--open-w);
		box-shadow: var(--shadow);
	}
	/* Collapsed, a rail shows only its glyphs and the brand's dot. The text stays in the page, so every
	   link keeps its accessible name. */
	.rail:not(:hover):not(:focus-within) :global(.label),
	.rail:not(:hover):not(:focus-within) .lead :global(h1),
	.rail:not(:hover):not(:focus-within) .lead :global(.cap) {
		opacity: 0;
	}
	.lead {
		padding: 0 var(--space-9) var(--space-8);
		white-space: nowrap;
	}
	.foot {
		margin-top: auto;
		border-top: 1px solid var(--border);
		padding-top: var(--space-4);
	}
	@media (prefers-reduced-motion: reduce) {
		.rail {
			transition: none;
		}
	}
</style>
