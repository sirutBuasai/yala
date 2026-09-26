<script lang="ts">
	// The app shell: loads the ledger once for every page and shows the sidebar in full, as an icon rail,
	// or folded into the hamburger sheet. Adding entries belongs to each page, which offers the kinds its context logs.
	import { onMount, type Snippet } from 'svelte';
	import { afterNavigate, beforeNavigate } from '$app/navigation';
	import '../../app.css';
	import { live, loadData, loadState } from '$lib/data/load';
	import { sidebarMode } from '$lib/nav/sidebar';
	import Brand from '$lib/nav/Brand.svelte';
	import { remember, rememberScroll, restoreScroll, scrollAt } from '$lib/nav/left';
	import NavMenu from '$lib/nav/NavMenu.svelte';
	import Sidebar from '$lib/nav/Sidebar.svelte';
	import Tooltip from '$lib/overlay/Tooltip.svelte';
	import { hideTip } from '$lib/utils/tooltip';
	import Banner from '$lib/ui/Banner.svelte';
	import { GridEnv } from '$lib/layout/grid/env.svelte';
	import { setGridEnv } from '$lib/layout/grid/context';

	let { children }: { children: Snippet } = $props();

	let viewport = $state(window.innerWidth);
	const mode = $derived(sidebarMode(viewport));

	// One grid environment for every page, measured off `.wrap`: its content box is the board's width.
	const env = new GridEnv();
	setGridEnv(env);

	/** Dismissed for this visit only: the banner is a standing fact, so it returns on a reload. */
	let bannerClosed = $state(false);

	onMount(loadData);
	beforeNavigate(({ from }) => {
		if (from) rememberScroll(from.url.pathname, window.scrollY);
	});
	// Only a link returns you to where you were: back and forward get the router's own restore, and a
	// drill-in opens its page from the top.
	afterNavigate(({ to, type }) => {
		// A click that navigates never gets the mouseleave that would have hidden its tooltip.
		hideTip();
		if (!to) return;
		remember(to.url.pathname);
		if (type === 'link') restoreScroll(scrollAt(to.url.pathname));
	});
</script>

<svelte:window bind:innerWidth={viewport} />

<a class="skip" href="#page">Skip to content</a>

<div class="shell">
	{#if mode !== 'sheet'}
		<Sidebar rail={mode === 'rail'} />
	{/if}

	<div class="wrap" bind:clientWidth={env.width}>
		{#if mode === 'sheet'}
			<header class="top">
				<NavMenu />
				<Brand />
			</header>
		{/if}

		<div aria-live="polite" aria-atomic="true">
			{#if $loadState.status === 'loading'}
				<Banner>Loading <code>data.json</code>...</Banner>
			{:else if $loadState.status === 'error'}
				<Banner role="alert">{$loadState.message}</Banner>
			{/if}
		</div>

		<!-- A standing notice: the banner only EXPLAINS why a save will be refused; the write guard in
		     `load.ts` is what actually refuses it. -->
		{#if $loadState.status === 'ready' && !$live && !bannerClosed}
			<Banner role="status" closeLabel="Dismiss" onclose={() => (bannerClosed = true)}>
				Read-only mode.
			</Banner>
		{/if}

		{#if $loadState.status === 'ready'}
			<main id="page" tabindex="-1">
				{@render children()}
			</main>
		{/if}
	</div>
</div>

<Tooltip />

<style>
	.shell {
		display: flex;
		align-items: flex-start;
	}
	.wrap {
		flex: 1;
		min-width: 0;
	}
	.top {
		display: flex;
		align-items: center;
		gap: var(--gap-field);
		margin-bottom: var(--space-10);
	}
	/* Focusable for the skip link, but a mouse click inside must not ring the whole page. */
	#page:focus {
		outline: none;
	}
</style>
