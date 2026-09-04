<script lang="ts">
	import { onMount } from 'svelte';
	import '../app.css';
	import {
		data,
		accounts,
		mode,
		loadState,
		loadViewData,
		enableEditMode,
		refreshEditData
	} from '$lib/data/load';
	import HomeView from '$lib/views/home/Home.svelte';
	import ActivityView from '$lib/views/activity/Activity.svelte';
	import NetWorthView from '$lib/views/networth/NetWorth.svelte';
	import ManageView from '$lib/views/manage/Manage.svelte';
	import ThemeToggle from '$lib/nav/ThemeToggle.svelte';
	import EditToggle from '$lib/nav/EditToggle.svelte';
	import Tooltip from '$lib/overlay/Tooltip.svelte';
	import NavMenu from '$lib/nav/NavMenu.svelte';
	import Segmented from '$lib/nav/Segmented.svelte';
	import { number, oneOf, Pref, record } from '$lib/utils/persist.svelte';

	const TABS = [
		{ id: 'home', label: 'Home' },
		{ id: 'activity', label: 'Activity' },
		{ id: 'networth', label: 'Net Worth' },
		{ id: 'manage', label: 'Manage' }
	] as const;
	type Tab = (typeof TABS)[number]['id'];

	// The view you were last on. The PERIOD each view was looking at is that view's own business —
	// each tab keeps its own key — so this page no longer owns any scope state.
	const tabPref = new Pref<Tab>('tab', 'home', oneOf(TABS.map((t) => t.id)));

	let hint = $state('');

	const edit = $derived($mode === 'edit');

	// Persist edit/view mode so a refresh, a logo click, or leaving to /dev and back keeps it.
	const modePref = new Pref<'edit' | 'view' | ''>('mode', '', oneOf(['edit', 'view'] as const));

	onMount(async () => {
		// Restore the last-used mode. Enter edit only when the user was last editing, or has no
		// saved preference (first visit prefers edit if the local API is up). If they explicitly
		// chose view, stay in view even when the API is reachable. Edit always falls back to view
		// when the API is unreachable.
		if (modePref.value === 'view') {
			await loadViewData();
		} else if (!(await enableEditMode())) {
			await loadViewData();
		}
	});

	// The preference records what the user ASKED for, not what they got. Recording the resolved mode
	// instead made a transient failure permanent: load the page while the API is restarting and edit
	// mode falls back to view, which then persisted as if it had been chosen — so every later load
	// took the "they explicitly chose view" branch and never retried the API again.
	function rememberMode(chosen: 'edit' | 'view'): void {
		modePref.value = chosen;
	}

	// --- scroll offset per tab ---
	//
	// Returning to a tab (or reloading) puts you back where you were reading rather than at the top
	// of a long transaction list. Offsets are held in plain state and flushed to storage only when
	// they can actually be read again — a write per scroll event would be hundreds of writes for a
	// value nothing looks at until a tab switch or a reload.
	/** Events that mean the user has taken the scroll position back off us. */
	const GESTURES = ['wheel', 'touchstart', 'keydown'] as const;

	const scrollPref = new Pref<Record<string, number>>('scroll', {}, record(number(0)));
	let offsets: Record<string, number> = { ...scrollPref.value };
	let restored = $state(false);
	/** True while `restore` is driving the scroll position; see why `remember` has to ignore it. */
	let restoring = false;

	function remember() {
		// Ignore scrolls we caused ourselves. Mid-restore the browser reports clamped intermediate
		// offsets, and recording those would store a position the user never chose.
		if (restoring) return;
		offsets[tabPref.value] = Math.round(window.scrollY);
	}
	function flush() {
		remember();
		scrollPref.value = { ...offsets };
	}

	/**
	 * Floor under the panel, in px, held across a tab swap. This is the crux of making scroll
	 * restoration work at all, and it is not obvious:
	 *
	 * Swapping the panel makes the page SHORTER for a moment, so the browser clamps the scroll offset
	 * to the new maximum. Asynchronous panes (Manage's settings, the balance checklist) then make it
	 * taller again — and Chrome, having clamped, restores its own remembered pre-clamp offset, which
	 * is the offset of the tab we just LEFT. It does this hundreds of milliseconds later, so it beats
	 * any scrollTo we issue and then gets recorded as if the user had chosen it.
	 *
	 * Holding the outgoing height means the page never shrinks, so there is no clamp and nothing for
	 * the browser to restore. Released once the incoming content has settled.
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
		tabPref.value = next;
		restore(next);
	}

	// The first restore has to wait for the data, since until then the panel is empty and the page
	// has no height to scroll into.
	$effect(() => {
		if (restored || !$data || $loadState.status !== 'ready') return;
		restored = true;
		restore(tabPref.value);
	});

	function showHint(msg: string) {
		hint = msg;
		setTimeout(() => (hint = ''), 7000);
	}

	function onsaved() {
		void refreshEditData();
	}
</script>

<!-- `pagehide` rather than `beforeunload`: it also fires when a tab is backgrounded on mobile, which
     is where a page is most likely to be discarded without ever unloading. -->
<svelte:window onscroll={remember} onpagehide={flush} />

<a class="skip" href="#view-panel">Skip to content</a>

<div class="wrap">
	<NavMenu />
	<header class="top">
		<div class="left">
			<a href="/" class="brand">
				<span class="dot"></span>
				<h1 class="serif">Yala</h1>
			</a>
			<span class="cap">
				{#if $data}
					{edit ? 'live · editing' : 'personal finance'} ·
					{$data.meta.transaction_count.toLocaleString()} txns ·
					{$data.meta.years[0]}–{$data.meta.years[$data.meta.years.length - 1]}
				{:else}
					personal finance · warm-dark
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
				<EditToggle onhint={showHint} onchosen={rememberMode} />
				<ThemeToggle />
			</div>
		</div>
	</header>

	<div aria-live="polite" aria-atomic="true">
		{#if $loadState.status === 'loading'}
			<div class="banner">Loading <code>data.json</code>…</div>
		{:else if $loadState.status === 'error'}
			<div class="banner" role="alert">{$loadState.message}</div>
		{/if}

		{#if hint}
			<div class="banner" role="status">{hint}</div>
		{/if}
	</div>

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
				<HomeView data={$data} accounts={$accounts} {edit} {onsaved} />
			{:else if tabPref.value === 'activity'}
				<ActivityView data={$data} {edit} accounts={$accounts} {onsaved} />
			{:else if tabPref.value === 'networth'}
				<NetWorthView data={$data} accounts={$accounts} {edit} {onsaved} />
			{:else}
				<ManageView data={$data} accounts={$accounts} {edit} {onsaved} />
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
	/* The tabpanel is focusable (APG) so keyboard users — and the skip link — can page into the
	   content. The shared :focus-visible ring covers the keyboard case; suppress the plain :focus
	   outline so a mouse click on a card never rings the whole panel. */
	#view-panel:focus {
		outline: none;
	}
	.tgls {
		display: flex;
		gap: var(--gap-row);
	}
</style>
