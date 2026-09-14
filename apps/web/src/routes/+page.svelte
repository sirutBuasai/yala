<script lang="ts">
	import { onMount } from 'svelte';
	import '../app.css';
	import { data, accounts, live, loadState, loadData, refreshData } from '$lib/data/load';
	import { yearSpan } from '$lib/utils/format';
	import HomeView from '$lib/views/home/Home.svelte';
	import ActivityView from '$lib/views/activity/Activity.svelte';
	import NetWorthView from '$lib/views/networth/NetWorth.svelte';
	import ManageView from '$lib/views/manage/Manage.svelte';
	import ThemeToggle from '$lib/nav/ThemeToggle.svelte';
	import Tooltip from '$lib/overlay/Tooltip.svelte';
	import NavMenu from '$lib/nav/NavMenu.svelte';
	import Segmented from '$lib/nav/Segmented.svelte';
	import Banner from '$lib/ui/Banner.svelte';
	import ArrangeToggle from '$lib/layout/grid/ArrangeToggle.svelte';
	import { GridEnv } from '$lib/layout/grid/env.svelte';
	import { setGridEnv } from '$lib/layout/grid/context';
	import { number, oneOf, Pref, record } from '$lib/utils/persist.svelte';

	const TABS = [
		{ id: 'home', label: 'Home' },
		{ id: 'activity', label: 'Activity' },
		{ id: 'networth', label: 'Net Worth' },
		{ id: 'manage', label: 'Manage' }
	] as const;
	type Tab = (typeof TABS)[number]['id'];

	// The view you were last on. Each tab keeps its OWN period key, so this page owns no scope state.
	const tabPref = new Pref<Tab>('tab', 'home', oneOf(TABS.map((t) => t.id)));

	// Page-wide grid environment, provided by context so the header's toggle and the boards can't
	// disagree about it.
	const env = new GridEnv();
	setGridEnv(env);

	/** Dismissed for this visit only: the banner is a standing fact, so it returns on a reload. */
	let bannerClosed = $state(false);

	onMount(loadData);

	// --- scroll offset per tab ---
	//
	// Plain state, flushed to storage only when it could be read again: a write per scroll event is
	// hundreds of writes nothing looks at until a tab switch or a reload.
	/** Events that mean the user has taken the scroll position back off us. */
	const GESTURES = ['wheel', 'touchstart', 'keydown'] as const;

	const scrollPref = new Pref<Record<string, number>>('scroll', {}, record(number(0)));
	let offsets: Record<string, number> = { ...scrollPref.value };
	let restored = $state(false);
	/** True while `restore` is driving the scroll position; `remember` must ignore those scrolls. */
	let restoring = false;

	function remember() {
		// Mid-restore the browser reports clamped intermediate offsets; recording those would store a
		// position the user never chose.
		if (restoring) return;
		offsets[tabPref.value] = Math.round(window.scrollY);
	}
	function flush() {
		remember();
		scrollPref.value = { ...offsets };
	}

	/**
	 * Floor under the panel, held across a tab swap, so the page never shrinks and the browser never clamps
	 * the scroll offset. Without it the clamp happens, and once async panes make the page tall again the
	 * browser restores its own pre-clamp offset late enough to beat any scrollTo. Released once the
	 * incoming content settles.
	 */
	let hold = $state<number | null>(null);
	let panelEl = $state<HTMLElement>();

	/** Put a tab's offset back, re-applying while the incoming content lays itself out. */
	function restore(tab: Tab) {
		const target = offsets[tab] ?? 0;
		const deadline = performance.now() + 400;
		restoring = true;

		// A real gesture always wins: the first wheel, touch or key press hands control back.
		const stop = () => {
			restoring = false;
			hold = null;
			for (const ev of GESTURES) removeEventListener(ev, stop);
		};
		for (const ev of GESTURES) addEventListener(ev, stop, { passive: true });

		const apply = () => {
			if (!restoring) return;
			window.scrollTo({ top: target, behavior: 'instant' });
			if (performance.now() < deadline) requestAnimationFrame(apply);
			else stop();
		};
		requestAnimationFrame(apply);
	}

	function switchTab(next: Tab) {
		flush(); // the tab being left, while `tabPref` still names it
		hold = panelEl?.offsetHeight ?? null;
		// Arranging deliberately SURVIVES the switch, since laying the app out is one job across boards.
		// Nothing is lost: each board commits on every gesture, so the one being left is already saved.
		tabPref.value = next;
		restore(next);
	}

	// The first restore must wait for the data: until then the page has no height to scroll into.
	$effect(() => {
		if (restored || !$data || $loadState.status !== 'ready') return;
		restored = true;
		restore(tabPref.value);
	});

	function onsaved() {
		void refreshData();
	}
</script>

<!-- `pagehide`, not `beforeunload`: it also fires when a tab is backgrounded on mobile, where a page
     is most likely to be discarded without ever unloading. -->
<svelte:window onscroll={remember} onpagehide={flush} />

<a class="skip" href="#view-panel">Skip to content</a>

<!-- The grid measures itself from this element: its content box IS the board's width, so the two
     can't disagree about how many columns fit. -->
<div class="wrap" bind:clientWidth={env.width}>
	<header class="top">
		<div class="left">
			<NavMenu />
			<a href="/" class="brand">
				<span class="dot"></span>
				<h1 class="serif">Yala</h1>
			</a>
			<span class="cap">
				{#if $data}
					{$live ? 'live' : 'snapshot'} ·
					{$data.meta.transaction_count.toLocaleString()} txns ·
					{yearSpan($data.meta.years)}
				{:else}
					personal finance
				{/if}
			</span>
		</div>
		<div class="controls">
			<Segmented
				options={[...TABS]}
				value={tabPref.value}
				onchange={switchTab}
				ariaLabel="Dashboard views"
				controls="view-panel"
				idPrefix="tab-"
				elevated
			/>
			<div class="tgls">
				<ArrangeToggle />
				<ThemeToggle />
			</div>
		</div>
	</header>

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

	{#if $data && $loadState.status === 'ready'}
		<div
			id="view-panel"
			role="tabpanel"
			aria-labelledby={`tab-${tabPref.value}`}
			tabindex="0"
			bind:this={panelEl}
			style:min-height={hold == null ? null : `${hold}px`}
		>
			{#if tabPref.value === 'home'}
				<HomeView data={$data} accounts={$accounts} {onsaved} />
			{:else if tabPref.value === 'activity'}
				<ActivityView data={$data} accounts={$accounts} {onsaved} />
			{:else if tabPref.value === 'networth'}
				<NetWorthView data={$data} accounts={$accounts} {onsaved} />
			{:else}
				<ManageView data={$data} accounts={$accounts} {onsaved} />
			{/if}
		</div>
	{/if}
</div>

<Tooltip />

<style>
	.top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--space-10);
		gap: var(--space-8);
		flex-wrap: wrap;
	}
	.left {
		display: flex;
		align-items: center;
		gap: var(--gap-field);
		flex-wrap: wrap;
	}
	.brand {
		display: flex;
		align-items: baseline;
		gap: var(--gap-field);
		text-decoration: none;
		color: inherit;
		cursor: pointer;
	}
	.brand:hover h1 {
		color: var(--lav-text);
	}
	.brand h1 {
		font-size: var(--text-brand);
		margin: 0;
		font-weight: var(--fw-semibold);
		letter-spacing: var(--ls-tight);
	}
	.brand .dot {
		width: 9px;
		height: 9px;
		border-radius: var(--radius-pill);
		background: var(--lav);
		box-shadow: 0 0 0 4px color-mix(in srgb, var(--lav) 20%, transparent);
		align-self: center;
	}
	.controls {
		display: flex;
		gap: var(--space-5);
		align-items: center;
		flex-wrap: wrap;
	}
	/* The tabpanel is focusable (APG) for the skip link, but the plain :focus outline is suppressed so
	   a mouse click on a card never rings the whole panel; :focus-visible still covers the keyboard. */
	#view-panel:focus {
		outline: none;
	}
	.tgls {
		display: flex;
		gap: var(--gap-row);
	}
</style>
