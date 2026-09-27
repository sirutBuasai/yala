<script lang="ts">
	// Analytics: read trends across months and years. Each grain is its
	// own board with its own stored arrangement.
	import { page } from '$app/stores';
	import type { DashboardData } from '$lib/data/types';
	import { periodPicks } from '$lib/nav/picks';
	import { viewOf } from '$lib/nav/views';
	import ViewHeader from '$lib/layout/ViewHeader.svelte';
	import ViewSwitch from '$lib/nav/ViewSwitch.svelte';
	import PeriodNav from '$lib/nav/PeriodNav.svelte';
	import MonthBoard from './MonthBoard.svelte';
	import YearBoard from './YearBoard.svelte';

	interface Props {
		data: DashboardData;
	}
	let { data }: Props = $props();

	const view = $derived(viewOf($page.params.view));
	const p = $derived(periodPicks($page.url, data, view));
</script>

<ViewHeader title="Analytics">
	<ViewSwitch ariaLabel="Analytics time range" />
	<PeriodNav {view} picks={p} />
</ViewHeader>

{#if view === 'month'}
	<MonthBoard {data} monthKey={p.monthKey} scoped={p.scoped} onpick={p.pickMonth} />
{:else}
	<YearBoard
		{data}
		monthKey={p.monthKey}
		scoped={p.scoped}
		since={p.since}
		spanText={p.spanText}
		onpick={p.pickYear}
	/>
{/if}
