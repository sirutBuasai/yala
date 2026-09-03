<script lang="ts">
	// Net Worth — your position over two ranges, replacing the old Overview / Yearly subtabs.
	//
	// There is no Month range on purpose: a month's net worth is just the latest snapshot, which the
	// Year view already shows as a point. Year carries the flows (what moved, and why) and is where
	// logging a balance belongs; All time carries the stocks and rates (how far this has got you).
	import type { DashboardData } from '$lib/data/types';
	import type { AccountsInfo } from '$lib/data/load';
	import ViewHeader from '$lib/layout/ViewHeader.svelte';
	import Segmented from '$lib/nav/Segmented.svelte';
	import YearNav from '$lib/nav/YearNav.svelte';
	import EditModals from '$lib/forms/EditModals.svelte';
	import YearView from '$lib/networth/YearView.svelte';
	import AllTimeView from '$lib/networth/AllTimeView.svelte';

	type Range = 'year' | 'all';

	interface Props {
		data: DashboardData;
		accounts: AccountsInfo | null;
		edit: boolean;
		onsaved: () => void;
	}
	let { data, accounts, edit, onsaved }: Props = $props();

	const RANGES: { id: Range; label: string }[] = [
		{ id: 'year', label: 'Year' },
		{ id: 'all', label: 'All time' }
	];
	let range = $state<Range>('year');

	const hasData = $derived(!!data.meta.domains.networth);

	// Years with a logged snapshot — the only years this page has anything to say about.
	const years = $derived([
		...new Set((data.networth?.series ?? []).map((p) => Number(p.date.slice(0, 4))))
	]);
	let year = $state<number>(0);
	$effect(() => {
		if (!year && years.length) year = years[years.length - 1]!;
	});

	const span = $derived(years.length ? `${years[0]}–${years[years.length - 1]}` : '');

	let modals: ReturnType<typeof EditModals>;
</script>

<ViewHeader title="Net Worth">
	{#if hasData}
		<Segmented
			options={RANGES}
			value={range}
			onchange={(r) => (range = r)}
			ariaLabel="Net worth time range"
		/>
		{#if range === 'year' && years.length}
			<YearNav value={year} {years} onchange={(y) => (year = y)} />
		{:else}
			<span class="sub">Lifetime · {span}</span>
		{/if}
	{/if}
	{#if edit && accounts && range === 'year'}
		<button class="btn-accent pill" onclick={() => modals.add('balance')}>+ Log balance</button>
	{:else if hasData && range === 'all'}
		<!-- Says why there's no add button here, so its absence reads as intent, not omission. -->
		<span class="ro">read-only — a balance belongs to the month it was taken in</span>
	{/if}
</ViewHeader>

{#if hasData}
	{#if range === 'year'}
		<YearView {data} {year} />
	{:else}
		<AllTimeView {data} />
	{/if}
{:else}
	<p class="empty">
		No balances logged yet.
		{#if edit}
			Use <b>+ Log balance</b> to snapshot a cash or investment account.
		{:else}
			Start the local API (<code>make serve-api</code>) to log balances.
		{/if}
	</p>
{/if}

<EditModals bind:this={modals} {accounts} {onsaved} addTitle="Log balance" />

<style>
	.sub {
		color: var(--ink-3);
		font-size: var(--text-subtitle);
	}
	.ro {
		color: var(--ink-3);
		font-size: var(--text-subtitle);
		font-style: italic;
		margin-left: auto;
	}
	.empty {
		color: var(--ink-3);
		font-size: var(--text-subtitle);
		padding: var(--space-8) 0;
	}
</style>
