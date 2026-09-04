<script lang="ts">
	// Activity — spending and income at three ranges, replacing the old Overview / Yearly / Monthly
	// trio. Range is a control on this page rather than three tabs, because those tabs were the same
	// data at three zoom levels; each range is still its own layout, since a month wants raw records
	// and a decade wants trends. Editing lives only in Month (entries are logged at day/month level)
	// and on the Home hub.
	import type { DashboardData } from '$lib/data/types';
	import type { AccountsInfo } from '$lib/data/load';
	import { latestMonthKey, latestYear } from '$lib/data/scope';
	import { matching, number, oneOf, Pref } from '$lib/utils/persist.svelte';
	import ViewHeader from '$lib/layout/ViewHeader.svelte';
	import Segmented from '$lib/nav/Segmented.svelte';
	import MonthNav from '$lib/nav/MonthNav.svelte';
	import YearNav from '$lib/nav/YearNav.svelte';
	import MonthView from '$lib/views/activity/MonthView.svelte';
	import YearView from '$lib/views/activity/YearView.svelte';
	import AllTimeView from '$lib/views/activity/AllTimeView.svelte';

	type Range = 'month' | 'year' | 'all';

	interface Props {
		data: DashboardData;
		edit: boolean;
		accounts: AccountsInfo | null;
		onsaved: () => void;
	}
	let { data, edit, accounts, onsaved }: Props = $props();

	const RANGES: { id: Range; label: string }[] = [
		{ id: 'month', label: 'Month' },
		{ id: 'year', label: 'Year' },
		{ id: 'all', label: 'All time' }
	];
	// All three remembered under this view's OWN keys. The zoom level you review at is a habit, not a
	// per-visit decision; and the period is Activity's alone — Home is a logging hub on whatever
	// month you're entering, which is rarely the month you're reviewing.
	const range = new Pref<Range>('activity-range', 'month', oneOf(RANGES.map((r) => r.id)));
	const month = new Pref('activity-month', '', matching(/^\d{4}-\d{2}$/));
	const yearPref = new Pref('activity-year', 0, number(0, 9999));

	// Seeded from the data the first time this view is ever used, then left alone: the steppers are
	// deliberately allowed to walk into empty periods.
	$effect(() => {
		if (!month.value) month.value = latestMonthKey(data);
		if (!yearPref.value) yearPref.value = latestYear(data);
	});
	const monthKey = $derived(month.value);
	const year = $derived(yearPref.value);

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
		value={range.value}
		onchange={(r) => (range.value = r)}
		ariaLabel="Activity time range"
	/>
	{#if range.value === 'month'}
		<MonthNav
			value={monthKey}
			monthKeys={data.meta.month_keys}
			onchange={(k) => (month.value = k)}
		/>
	{:else if range.value === 'year'}
		<YearNav value={year} {years} onchange={(y) => (yearPref.value = y)} />
	{:else}
		<span class="cap">Lifetime · {span}</span>
	{/if}
	{#if range.value !== 'month'}
		<!-- Says why there's no add button here, so its absence reads as intent, not omission. -->
		<span class="cap quiet push-end">read-only — entries are logged by day and month</span>
	{/if}
</ViewHeader>

{#if range.value === 'month'}
	<MonthView {data} {monthKey} {edit} {accounts} {onsaved} />
{:else if range.value === 'year'}
	<YearView {data} {year} />
{:else}
	<AllTimeView {data} />
{/if}
