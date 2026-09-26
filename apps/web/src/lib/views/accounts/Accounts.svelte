<script lang="ts">
	// Accounts: log balances and read net worth (docs/redesign/specs/accounts.md). Each grain is its own
	// board with its own stored arrangement.
	import { page } from '$app/stores';
	import type { DashboardData } from '$lib/data/types';
	import type { AccountsInfo } from '$lib/data/load';
	import { snapshotYears } from '$lib/data/networth';
	import { periodPicks } from '$lib/nav/picks';
	import { viewOf } from '$lib/nav/views';
	import ViewHeader from '$lib/layout/ViewHeader.svelte';
	import ViewSwitch from '$lib/nav/ViewSwitch.svelte';
	import PeriodNav from '$lib/nav/PeriodNav.svelte';
	import MonthBoard from './MonthBoard.svelte';
	import YearBoard from './YearBoard.svelte';

	interface Props {
		data: DashboardData;
		accounts: AccountsInfo | null;
		onsaved: () => void;
	}
	let { data, accounts, onsaved }: Props = $props();

	const view = $derived(viewOf($page.params.view));
	const p = $derived(periodPicks($page.url, data, view, snapshotYears(data)));
	/** The account Log balances opens at, from Where the money sits. */
	const account = $derived($page.state.drill?.focus ?? null);
	const hasData = $derived(!!data.meta.domains.networth);
</script>

<ViewHeader title="Accounts">
	<ViewSwitch ariaLabel="Accounts time range" />
	{#if view === 'month' || hasData}
		<PeriodNav {view} picks={p} />
	{/if}
</ViewHeader>

<!-- Month always shows, since Log balances on it is how the first balance gets logged. -->
{#if view === 'month'}
	<MonthBoard
		{data}
		{accounts}
		{onsaved}
		monthKey={p.monthKey}
		scoped={p.scoped}
		onpick={p.pickMonth}
		{account}
	/>
{:else if hasData}
	<YearBoard
		{data}
		monthKey={p.monthKey}
		scoped={p.scoped}
		since={p.since}
		spanText={p.spanText}
		onpick={p.pickYear}
	/>
{:else}
	<p class="cap pad">No balances logged yet. Log each account balance to start tracking.</p>
{/if}

<style>
	.pad {
		padding: var(--space-8) 0;
	}
</style>
