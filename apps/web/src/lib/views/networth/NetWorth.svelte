<script lang="ts">
	// Net Worth — your position over two ranges, replacing the old Overview / Yearly subtabs.
	//
	// There is no Month range on purpose: a month's net worth is just the latest snapshot, which the
	// Year view already shows as a point. Year carries the flows (what moved, and why) and is where
	// logging a balance belongs; All time carries the stocks and rates (how far this has got you).
	import type { DashboardData } from '$lib/data/types';
	import type { AccountsInfo } from '$lib/data/load';
	import { number, oneOf, Pref } from '$lib/utils/persist.svelte';
	import ViewHeader from '$lib/layout/ViewHeader.svelte';
	import Segmented from '$lib/nav/Segmented.svelte';
	import YearNav from '$lib/nav/YearNav.svelte';
	import EditModals from '$lib/entries/EditModals.svelte';
	import YearView from '$lib/views/networth/YearView.svelte';
	import AllTimeView from '$lib/views/networth/AllTimeView.svelte';

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
	// Range and year are remembered, so a refresh (or a trip through another tab) comes back to the
	// same view. This page keeps its own year rather than sharing Activity's: only years with a
	// logged snapshot mean anything here, and they're rarely the same set.
	const range = new Pref<Range>('networth-range', 'year', oneOf(RANGES.map((r) => r.id)));
	const year = new Pref('networth-year', 0, number(0, 9999));

	const hasData = $derived(!!data.meta.domains.networth);

	// Years with a logged snapshot — the only years this page has anything to say about.
	const years = $derived([
		...new Set((data.networth?.series ?? []).map((p) => Number(p.date.slice(0, 4))))
	]);
	// Fall back to the latest snapshot year when nothing is remembered, or when what was remembered
	// is a year this ledger no longer has snapshots for.
	$effect(() => {
		if (years.length && !years.includes(year.value)) year.value = years[years.length - 1]!;
	});

	const span = $derived(years.length ? `${years[0]}–${years[years.length - 1]}` : '');

	let modals: ReturnType<typeof EditModals>;
</script>

<ViewHeader title="Net Worth">
	{#if hasData}
		<Segmented
			options={RANGES}
			value={range.value}
			onchange={(r) => (range.value = r)}
			ariaLabel="Net worth time range"
		/>
		{#if range.value === 'year' && years.length}
			<YearNav value={year.value} {years} onchange={(y) => (year.value = y)} />
		{:else}
			<span class="cap">Lifetime · {span}</span>
		{/if}
	{/if}
	{#if edit && accounts && range.value === 'year'}
		<button class="btn-accent pill" onclick={() => modals.add('balance')}>+ Log balance</button>
	{:else if hasData && range.value === 'all'}
		<!-- Says why there's no add button here, so its absence reads as intent, not omission. -->
		<span class="cap quiet push-end"
			>read-only — a balance belongs to the month it was taken in</span
		>
	{/if}
</ViewHeader>

{#if hasData}
	{#if range.value === 'year'}
		<YearView {data} year={year.value} />
	{:else}
		<AllTimeView {data} />
	{/if}
{:else}
	<p class="cap pad">
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
	/* Voice comes from the shared `.cap`; only the standalone spacing is local, since this line
	   stands in for a whole page of panes rather than sitting under a title. */
	.pad {
		padding: var(--space-8) 0;
	}
</style>
