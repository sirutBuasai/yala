<script lang="ts">
	// The app shell: loads the ledger once for every page, docks the sidebar (or folds it into the
	// hamburger sheet), and owns the one Add entry modal every page shares.
	import { onMount, type Snippet } from 'svelte';
	import '../../app.css';
	import { accounts, live, loadData, loadState, refreshData } from '$lib/data/load';
	import { docks } from '$lib/nav/sidebar';
	import Brand from '$lib/nav/Brand.svelte';
	import NavMenu from '$lib/nav/NavMenu.svelte';
	import Sidebar from '$lib/nav/Sidebar.svelte';
	import ThemeToggle from '$lib/nav/ThemeToggle.svelte';
	import EditModals from '$lib/entries/EditModals.svelte';
	import Tooltip from '$lib/overlay/Tooltip.svelte';
	import Banner from '$lib/ui/Banner.svelte';

	let { children }: { children: Snippet } = $props();

	let viewport = $state(window.innerWidth);
	const docked = $derived(docks(viewport));

	/** Dismissed for this visit only: the banner is a standing fact, so it returns on a reload. */
	let bannerClosed = $state(false);

	let modals: ReturnType<typeof EditModals>;

	onMount(loadData);
</script>

<svelte:window bind:innerWidth={viewport} />

<a class="skip" href="#page">Skip to content</a>

<div class="shell">
	{#if docked}
		<Sidebar onadd={() => modals.add()} />
	{/if}

	<div class="wrap">
		{#if !docked}
			<header class="top">
				<div class="left">
					<NavMenu />
					<Brand />
				</div>
				<div class="controls">
					<button class="btn-accent pill" onclick={() => modals.add()}>+ Add entry</button>
					<ThemeToggle />
				</div>
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

<EditModals bind:this={modals} accounts={$accounts} onsaved={refreshData} addTitle="Add entry" />

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
		justify-content: space-between;
		margin-bottom: var(--space-10);
		gap: var(--space-8);
		flex-wrap: wrap;
	}
	.left,
	.controls {
		display: flex;
		align-items: center;
		gap: var(--gap-field);
		flex-wrap: wrap;
	}
	/* Focusable for the skip link, but a mouse click inside must not ring the whole page. */
	#page:focus {
		outline: none;
	}
</style>
