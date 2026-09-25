<script lang="ts">
	// Accounts: log balances and read net worth (docs/redesign/specs/accounts.md). Each grain is its own
	// board with its own stored arrangement.
	import { page } from '$app/stores';
	import type { DashboardData } from '$lib/data/types';
	import type { AccountsInfo } from '$lib/data/load';
	import { snapshotYears } from '$lib/data/networth';
	import { yearSpan } from '$lib/utils/format';
	import { periodPicks } from '$lib/nav/picks';
	import { viewOf } from '$lib/nav/views';
	import ViewHeader from '$lib/layout/ViewHeader.svelte';
	import ViewSwitch from '$lib/nav/ViewSwitch.svelte';
	import YearNav from '$lib/nav/YearNav.svelte';
	import MonthBoard from './MonthBoard.svelte';
	import { ACCOUNT_PARAM } from './drill';
	import YearBoard from './YearBoard.svelte';

	interface Props {
		data: DashboardData;
		accounts: AccountsInfo | null;
		onsaved: () => void;
	}
	let { data, accounts, onsaved }: Props = $props();

	const view = $derived(viewOf($page.params.view));
	const p = $derived(periodPicks($page.url, data, view));
	/** The account Log balances opens at, from Where the money sits. */
	const account = $derived($page.url.searchParams.get(ACCOUNT_PARAM));
	const hasData = $derived(!!data.meta.domains.networth);
	const span = $derived(yearSpan(snapshotYears(data)));
</script>

<ViewHeader title="Accounts">
	<ViewSwitch ariaLabel="Accounts time range" />
	{#if view === 'month'}
		<YearNav value={p.year} years={p.years} onchange={p.moveToYear} />
	{:else if hasData}
		<span class="cap">Lifetime · {span}</span>
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
	<YearBoard {data} />
{:else}
	<p class="cap pad">No balances logged yet. Log each account balance to start tracking.</p>
{/if}

<style>
	.pad {
		padding: var(--space-8) 0;
	}
</style>
