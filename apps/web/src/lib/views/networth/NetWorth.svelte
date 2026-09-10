<script lang="ts">
	// Net Worth — your position over two ranges. There is no Month range on purpose: a month's net
	// worth is just the latest snapshot, which the Year view already shows as a point.
	import type { DashboardData } from '$lib/data/types';
	import type { AccountsInfo } from '$lib/data/load';
	import { number, oneOf, Pref } from '$lib/utils/persist.svelte';
	import { yearSpan } from '$lib/utils/format';
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
		onsaved: () => void;
	}
	let { data, accounts, onsaved }: Props = $props();

	const RANGES: { id: Range; label: string }[] = [
		{ id: 'year', label: 'Year' },
		{ id: 'all', label: 'All time' }
	];
	// Its own year rather than Activity's: only years with a logged snapshot mean anything here.
	const range = new Pref<Range>('networth-range', 'year', oneOf(RANGES.map((r) => r.id)));
	const year = new Pref('networth-year', 0, number(0, 9999));

	const hasData = $derived(!!data.meta.domains.networth);

	const years = $derived([
		...new Set((data.networth?.series ?? []).map((p) => Number(p.date.slice(0, 4))))
	]);
	// Fall back to the latest snapshot year when the remembered one has no snapshots in this ledger.
	$effect(() => {
		if (years.length && !years.includes(year.value)) year.value = years[years.length - 1]!;
	});

	const span = $derived(yearSpan(years));

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
	{#if range.value === 'year'}
		<button class="btn-accent pill" onclick={() => modals.add('balance')}>+ Log balance</button>
	{:else if hasData}
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
		No balances logged yet. Use <b>+ Log balance</b> to snapshot a cash or investment account.
	</p>
{/if}

<EditModals bind:this={modals} {accounts} {onsaved} addTitle="Log balance" />

<style>
	/* Only the standalone spacing is local; the voice comes from the shared `.cap`. */
	.pad {
		padding: var(--space-8) 0;
	}
</style>
