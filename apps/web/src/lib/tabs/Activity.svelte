<script lang="ts">
	// Activity — spending and income at three ranges, replacing the old Overview / Yearly / Monthly
	// trio. Range is a control on this page rather than three tabs, because those tabs were the same
	// data at three zoom levels; each range is still its own layout, since a month wants raw records
	// and a decade wants trends. Editing lives only in Month (entries are logged at day/month level)
	// and on the Home hub.
	import type { DashboardData } from '$lib/data/types';
	import type { AccountsInfo } from '$lib/data/load';
	import ViewHeader from '$lib/layout/ViewHeader.svelte';
	import Segmented from '$lib/nav/Segmented.svelte';
	import MonthNav from '$lib/nav/MonthNav.svelte';
	import YearNav from '$lib/nav/YearNav.svelte';
	import MonthView from '$lib/activity/MonthView.svelte';
	import YearView from '$lib/activity/YearView.svelte';
	import AllTimeView from '$lib/activity/AllTimeView.svelte';

	type Range = 'month' | 'year' | 'all';

	interface Props {
		data: DashboardData;
		/** Shared with the rest of the app so a range switch keeps the period you were on. */
		monthKey: string;
		year: number;
		edit: boolean;
		accounts: AccountsInfo | null;
		onsaved: () => void;
	}
	let {
		data,
		monthKey = $bindable(),
		year = $bindable(),
		edit,
		accounts,
		onsaved
	}: Props = $props();

	const RANGES: { id: Range; label: string }[] = [
		{ id: 'month', label: 'Month' },
		{ id: 'year', label: 'Year' },
		{ id: 'all', label: 'All time' }
	];
	let range = $state<Range>('month');

	// Year picker options: the tracked years, one past the latest, and wherever we've navigated —
	// so stepping to a not-yet-populated year still shows a valid selection reading as zero.
	const years = $derived.by(() => {
		const ys = data.meta.years;
		const latest = ys[ys.length - 1] ?? year;
		return [...new Set([...ys, latest + 1, year])].sort((a, b) => b - a);
	});

	const span = $derived(
		data.meta.years.length
			? `${data.meta.years[0]}–${data.meta.years[data.meta.years.length - 1]}`
			: ''
	);
</script>

<ViewHeader title="Activity">
	<Segmented
		options={RANGES}
		value={range}
		onchange={(r) => (range = r)}
		ariaLabel="Activity time range"
	/>
	{#if range === 'month'}
		<MonthNav value={monthKey} monthKeys={data.meta.month_keys} onchange={(k) => (monthKey = k)} />
	{:else if range === 'year'}
		<YearNav value={year} {years} onchange={(y) => (year = y)} />
	{:else}
		<span class="sub">Lifetime · {span}</span>
	{/if}
	{#if range !== 'month'}
		<span class="ro">read-only — entries are logged by day and month</span>
	{/if}
</ViewHeader>

{#if range === 'month'}
	<MonthView {data} {monthKey} {edit} {accounts} {onsaved} />
{:else if range === 'year'}
	<YearView {data} {year} />
{:else}
	<AllTimeView {data} />
{/if}

<style>
	.sub {
		color: var(--ink-3);
		font-size: var(--text-subtitle);
	}
	/* Says why there's no add button here, so its absence reads as intent rather than omission. */
	.ro {
		color: var(--ink-3);
		font-size: var(--text-subtitle);
		font-style: italic;
		margin-left: auto;
	}
</style>
