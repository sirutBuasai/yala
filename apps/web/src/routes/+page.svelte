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
	import OverviewView from '$lib/tabs/Overview.svelte';
	import YearlyView from '$lib/tabs/Yearly.svelte';
	import MonthlyView from '$lib/tabs/Monthly.svelte';
	import CalendarView from '$lib/tabs/Calendar.svelte';
	import ThemeToggle from '$lib/forms/ThemeToggle.svelte';
	import EditToggle from '$lib/forms/EditToggle.svelte';
	import Tooltip from '$lib/ui/Tooltip.svelte';
	import NavMenu from '$lib/ui/NavMenu.svelte';

	type Tab = 'overview' | 'yearly' | 'monthly' | 'calendar';
	let tab = $state<Tab>('overview');
	let year = $state<number>(0); // 0 = unset; the default-scope effect fills it once data loads
	let monthKey = $state<string>('');
	let hint = $state('');

	const edit = $derived($mode === 'edit');

	// Persist the current view (tab + selected year/month) so a refresh returns you to it.
	const VIEW_KEY = 'yala-view';
	// Persist edit/view mode so a refresh, a logo click, or leaving to /dev and back keeps it.
	const MODE_KEY = 'yala-mode';
	let restored = false;

	onMount(async () => {
		let savedMode: string | null = null;
		try {
			const raw = localStorage.getItem(VIEW_KEY);
			if (raw) {
				const s = JSON.parse(raw);
				if (['overview', 'yearly', 'monthly', 'calendar'].includes(s.tab)) tab = s.tab;
				if (typeof s.year === 'number') year = s.year;
				if (typeof s.monthKey === 'string') monthKey = s.monthKey;
			}
			savedMode = localStorage.getItem(MODE_KEY);
		} catch {
			/* corrupt/unavailable storage — fall back to defaults */
		}
		restored = true;

		// Restore the last-used mode. Enter edit only when the user was last editing, or has no
		// saved preference (first visit prefers edit if the local API is up). If they explicitly
		// chose view, stay in view even when the API is reachable. Edit always falls back to view
		// when the API is unreachable.
		if (savedMode === 'view') {
			await loadViewData();
		} else if (!(await enableEditMode())) {
			await loadViewData();
		}
	});

	// Save on any change (after the initial restore). Reads the deps before the guard so the
	// effect stays subscribed to tab/year/monthKey.
	$effect(() => {
		const snapshot = JSON.stringify({ tab, year, monthKey });
		if (!restored) return;
		try {
			localStorage.setItem(VIEW_KEY, snapshot);
		} catch {
			/* storage unavailable — persistence is best-effort */
		}
	});

	// Persist the resolved mode whenever it changes (toggle or load), after the initial restore.
	$effect(() => {
		const m = $mode;
		if (!restored) return;
		try {
			localStorage.setItem(MODE_KEY, m);
		} catch {
			/* storage unavailable — persistence is best-effort */
		}
	});

	// Initialize the scope selectors to the newest available period on first load only. We
	// deliberately don't clamp afterwards, so Yearly/Monthly can step to empty (zero-data)
	// periods via their prev/next arrows.
	$effect(() => {
		const d = $data;
		if (!d) return;
		if (!year) year = d.meta.years[d.meta.years.length - 1] ?? year;
		if (!monthKey) monthKey = d.meta.month_keys[d.meta.month_keys.length - 1] ?? monthKey;
	});

	function showHint(msg: string) {
		hint = msg;
		setTimeout(() => (hint = ''), 7000);
	}

	function onsaved() {
		void refreshEditData();
	}
</script>

<div class="wrap">
	<NavMenu />
	<header class="top">
		<div class="left">
			<a href="/" class="brand">
				<span class="dot"></span>
				<h1 class="serif">Yala</h1>
			</a>
			<span class="sub">
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
			<nav class="views">
				<button class:active={tab === 'overview'} onclick={() => (tab = 'overview')}
					>Overview</button
				>
				<button class:active={tab === 'yearly'} onclick={() => (tab = 'yearly')}>Yearly</button>
				<button class:active={tab === 'monthly'} onclick={() => (tab = 'monthly')}>Monthly</button>
				<button class:active={tab === 'calendar'} onclick={() => (tab = 'calendar')}
					>Calendar</button
				>
			</nav>
			<div class="tgls">
				<EditToggle onhint={showHint} />
				<ThemeToggle />
			</div>
		</div>
	</header>

	{#if $loadState.status === 'loading'}
		<div class="banner">Loading <code>data.json</code>…</div>
	{:else if $loadState.status === 'error'}
		<div class="banner">{$loadState.message}</div>
	{/if}

	{#if hint}
		<div class="banner">{hint}</div>
	{/if}

	{#if $data && $loadState.status === 'ready'}
		{#if tab === 'overview'}
			<OverviewView data={$data} />
		{:else if tab === 'yearly'}
			<YearlyView data={$data} bind:year />
		{:else if tab === 'monthly'}
			<MonthlyView data={$data} bind:monthKey {edit} accounts={$accounts} {onsaved} />
		{:else}
			<CalendarView data={$data} {edit} accounts={$accounts} {onsaved} />
		{/if}
	{/if}
</div>

<Tooltip />

<style>
	.top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 20px;
		gap: 16px;
		flex-wrap: wrap;
	}
	.left {
		display: flex;
		align-items: center;
		gap: 12px;
		flex-wrap: wrap;
	}
	.brand {
		display: flex;
		align-items: baseline;
		gap: 12px;
		text-decoration: none;
		color: inherit;
		cursor: pointer;
	}
	.brand:hover h1 {
		color: var(--lav-text);
	}
	.brand h1 {
		font-size: 26px;
		margin: 0;
		font-weight: 600;
		letter-spacing: -0.3px;
	}
	.brand .dot {
		width: 9px;
		height: 9px;
		border-radius: 50%;
		background: var(--lav);
		box-shadow: 0 0 0 4px color-mix(in srgb, var(--lav) 20%, transparent);
		align-self: center;
	}
	.sub {
		color: var(--ink-3);
		font-size: 12.5px;
	}
	.controls {
		display: flex;
		gap: 10px;
		align-items: center;
		flex-wrap: wrap;
	}
	nav.views {
		display: flex;
		gap: 4px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 999px;
		padding: 4px;
		box-shadow: var(--shadow);
	}
	nav.views button {
		border: 0;
		background: none;
		color: var(--ink-2);
		padding: 8px 15px;
		border-radius: 999px;
		font-size: 13px;
		cursor: pointer;
		font-weight: 500;
	}
	nav.views button.active {
		background: color-mix(in srgb, var(--lav) 20%, transparent);
		color: var(--ink);
	}
	nav.views button:hover:not(.active) {
		color: var(--ink);
	}
	.tgls {
		display: flex;
		gap: 8px;
	}
</style>
