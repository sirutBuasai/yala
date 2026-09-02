<script lang="ts">
	import type { DashboardData } from '$lib/data/types';
	import type { AccountsInfo } from '$lib/data/load';
	import type { Scope } from '$lib/data/scope';
	import ViewHeader from '$lib/layout/ViewHeader.svelte';
	import Board from '$lib/layout/Board.svelte';
	import YearNav from '$lib/nav/YearNav.svelte';
	import EditModals from '$lib/forms/EditModals.svelte';

	interface Props {
		data: DashboardData;
		accounts: AccountsInfo | null;
		edit: boolean;
		onsaved: () => void;
	}
	let { data, accounts, edit, onsaved }: Props = $props();

	type View = 'overview' | 'yearly';
	let view = $state<View>('overview');

	const all: Scope = { level: 'all' };
	const hasData = $derived(!!data.meta.domains.networth);

	// Years that have a logged snapshot, for the Yearly stepper.
	const years = $derived([
		...new Set((data.networth?.series ?? []).map((p) => Number(p.date.slice(0, 4))))
	]);
	let year = $state<number>(0);
	$effect(() => {
		if (!year && years.length) year = years[years.length - 1]!;
	});
	const yr = $derived<Scope>({ level: 'year', year });

	const has = (group: 'cash' | 'investment') =>
		(data.networth?.accounts ?? []).some((a) => a.group === group);
	const hasInvestments = $derived(has('investment'));
	const hasCash = $derived(has('cash'));
	const hasAdjustments = $derived((data.networth?.adjustments ?? []).length > 0);

	type Cell = {
		id: string;
		scope: Scope;
		chart?: string;
		title: string;
		cap?: string;
		span: number;
		area?: boolean;
	};

	const kpis = $derived<Cell[]>([
		{ id: 'networth.current', scope: all, title: 'Net worth', span: 2 },
		{ id: 'networth.assets', scope: all, title: 'Assets', span: 2 },
		{ id: 'networth.liabilities', scope: all, title: 'Liabilities', span: 2 },
		{ id: 'networth.invested', scope: all, title: 'Invested', span: 3 },
		{ id: 'networth.liquid', scope: all, title: 'Liquid', span: 3 }
	]);

	const overviewCharts = $derived(
		[
			{
				id: 'networth.trend',
				scope: all,
				chart: 'line',
				area: true,
				title: 'Net worth over time',
				cap: 'Assets − liabilities per logged month',
				span: 6
			},
			{
				id: 'networth.allocation',
				scope: all,
				chart: 'donut',
				title: 'Allocation',
				cap: 'Where your money sits now',
				span: 3
			},
			{
				id: 'networth.allocation_trend',
				scope: all,
				chart: 'line',
				title: 'Allocation over time',
				cap: 'Liquid · taxable · tax-advantaged',
				span: 3
			},
			hasInvestments && {
				id: 'networth.investments',
				scope: all,
				chart: 'ranked-bars',
				title: 'Investments by account',
				cap: 'Current value',
				span: 3
			},
			hasCash && {
				id: 'networth.cash',
				scope: all,
				chart: 'donut',
				title: 'Cash by account',
				cap: 'Current balance',
				span: 3
			},
			hasAdjustments && {
				id: 'networth.adjustments',
				scope: all,
				chart: 'table',
				title: 'Untracked adjustments',
				cap: 'Cumulative plug per account — a large jump flags an unlogged transfer',
				span: 6
			}
		].filter(Boolean) as Cell[]
	);

	const yearlyCharts = $derived<Cell[]>([
		{
			id: 'networth.by_month',
			scope: yr,
			chart: 'line',
			area: true,
			title: 'Net worth by month',
			cap: String(year),
			span: 6
		},
		{
			id: 'networth.monthly_table',
			scope: yr,
			chart: 'table',
			title: 'Monthly snapshots',
			cap: 'Month-over-month change',
			span: 6
		}
	]);

	let modals: ReturnType<typeof EditModals>;
</script>

<ViewHeader title="Net Worth">
	{#if hasData}
		<div class="seg" role="tablist" aria-label="Net worth view">
			<button
				role="tab"
				aria-selected={view === 'overview'}
				class:active={view === 'overview'}
				onclick={() => (view = 'overview')}>Overview</button
			>
			<button
				role="tab"
				aria-selected={view === 'yearly'}
				class:active={view === 'yearly'}
				onclick={() => (view = 'yearly')}>Yearly</button
			>
		</div>
		{#if view === 'yearly' && years.length}
			<YearNav value={year} {years} onchange={(y) => (year = y)} />
		{/if}
	{/if}
	{#if edit && accounts}
		<button class="btn-accent pill" onclick={() => modals.add('balance')}>+ Log balance</button>
	{/if}
</ViewHeader>

{#if hasData}
	{#if view === 'overview'}
		<Board {data} cells={kpis} />
		<Board {data} cells={overviewCharts} />
	{:else}
		<Board {data} cells={yearlyCharts} />
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
	.seg {
		display: flex;
		gap: var(--space-2);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-pill);
		padding: var(--space-2);
	}
	.seg button {
		border: 0;
		background: none;
		color: var(--ink-2);
		padding: var(--space-3) var(--space-7);
		border-radius: var(--radius-pill);
		font: inherit;
		font-size: var(--text-control);
		font-weight: var(--fw-medium);
		cursor: pointer;
	}
	.seg button.active {
		background: color-mix(in srgb, var(--lav) 20%, transparent);
		color: var(--ink);
	}
	.empty {
		color: var(--ink-3);
		font-size: var(--text-subtitle);
		padding: var(--space-8) 0;
	}
</style>
