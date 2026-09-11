<script lang="ts">
	// Activity — spending and income at three ranges. Range is a control here rather than three tabs,
	// but each range is still its own BOARD with its own stored arrangement. Only Month can edit, since
	// entries are logged at day/month level.
	import type { DashboardData } from '$lib/data/types';
	import type { AccountsInfo } from '$lib/data/load';
	import { latestMonthKey, latestYear } from '$lib/data/scope';
	import { matching, number, oneOf, Pref } from '$lib/utils/persist.svelte';
	import { yearSpan } from '$lib/utils/format';
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
		accounts: AccountsInfo | null;
		onsaved: () => void;
	}
	let { data, accounts, onsaved }: Props = $props();

	const RANGES: { id: Range; label: string }[] = [
		{ id: 'month', label: 'Month' },
		{ id: 'year', label: 'Year' },
		{ id: 'all', label: 'All time' }
	];
	// All three under this view's OWN keys: the period you review at is rarely the one you log into.
	const range = new Pref<Range>('activity-range', 'month', oneOf(RANGES.map((r) => r.id)));
	const month = new Pref('activity-month', '', matching(/^\d{4}-\d{2}$/));
	const yearPref = new Pref('activity-year', 0, number(0, 9999));

	// Seeded once, then left alone: the steppers may deliberately walk into empty periods.
	$effect(() => {
		if (!month.value) month.value = latestMonthKey(data);
		if (!yearPref.value) yearPref.value = latestYear(data);
	});
	const monthKey = $derived(month.value);
	const year = $derived(yearPref.value);

	// The tracked years, one past the latest, and wherever we've navigated — so stepping into an
	// unpopulated year still shows a valid selection.
	const years = $derived.by(() => {
		const ys = data.meta.years;
		const latest = ys[ys.length - 1] ?? year;
		return [...new Set([...ys, latest + 1, year])].sort((a, b) => b - a);
	});

	const span = $derived(yearSpan(data.meta.years));
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
</ViewHeader>

{#if range.value === 'month'}
	<MonthView {data} {monthKey} {accounts} {onsaved} />
{:else if range.value === 'year'}
	<YearView {data} {year} />
{:else}
	<AllTimeView {data} />
{/if}
