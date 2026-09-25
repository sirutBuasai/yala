<script lang="ts">
	// Accounts: log balances and read net worth (docs/redesign/specs/accounts.md). Each grain is its own
	// board with its own stored arrangement.
	import { page } from '$app/stores';
	import type { DashboardData } from '$lib/data/types';
	import type { AccountsInfo } from '$lib/data/load';
	import { latestMonthKey } from '$lib/data/scope';
	import { snapshotYears } from '$lib/data/networth';
	import { yearSpan } from '$lib/utils/format';
	import { focusMonth, MONTH_PARAM } from '$lib/nav/focus';
	import { step } from '$lib/nav/step';
	import { viewOf } from '$lib/nav/views';
	import ViewHeader from '$lib/layout/ViewHeader.svelte';
	import ViewSwitch from '$lib/nav/ViewSwitch.svelte';
	import MonthNav from '$lib/nav/MonthNav.svelte';
	import MonthBoard from './MonthBoard.svelte';
	import YearBoard from './YearBoard.svelte';

	interface Props {
		data: DashboardData;
		accounts: AccountsInfo | null;
		onsaved: () => void;
	}
	let { data, accounts, onsaved }: Props = $props();

	const view = $derived(viewOf($page.params.view));
	const monthKey = $derived(focusMonth($page.url, latestMonthKey(data)));
	const hasData = $derived(!!data.meta.domains.networth);
	const span = $derived(yearSpan(snapshotYears(data)));
</script>

<ViewHeader title="Accounts">
	<ViewSwitch ariaLabel="Accounts time range" />
	{#if view === 'month'}
		<MonthNav
			value={monthKey}
			monthKeys={data.meta.month_keys}
			onchange={(k) => step($page.url, { [MONTH_PARAM]: k })}
		/>
	{:else if hasData}
		<span class="cap">Lifetime · {span}</span>
	{/if}
</ViewHeader>

<!-- Month always shows, since Log balances on it is how the first balance gets logged. -->
{#if view === 'month'}
	<MonthBoard {data} {accounts} {onsaved} {monthKey} />
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
