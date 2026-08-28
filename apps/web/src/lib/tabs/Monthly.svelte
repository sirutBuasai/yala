<script lang="ts">
	import type { DashboardData } from '$lib/data/types';
	import type { AccountsInfo } from '$lib/data/load';
	import type { Scope } from '$lib/data/scope';
	import { money, monthLabel } from '$lib/utils/format';
	import { build } from '$lib/data/catalog';
	import Pane from '$lib/layout/Pane.svelte';
	import ViewHeader from '$lib/layout/ViewHeader.svelte';
	import Board from '$lib/layout/Board.svelte';
	import MonthNav from '$lib/nav/MonthNav.svelte';
	import Figure from '$lib/charts/Figure.svelte';
	import TransactionList, { TXN_SORTS, type TxnSort } from '$lib/lists/TransactionList.svelte';
	import TransferList from '$lib/lists/TransferList.svelte';
	import SortMenu from '$lib/lists/SortMenu.svelte';
	import PaycheckList from '$lib/lists/PaycheckList.svelte';
	import PendingQueue from '$lib/lists/PendingQueue.svelte';
	import EditModals from '$lib/forms/EditModals.svelte';
	import Empty from '$lib/layout/Empty.svelte';

	interface Props {
		data: DashboardData;
		monthKey: string;
		edit: boolean;
		accounts: AccountsInfo | null;
		onsaved: () => void;
	}
	let { data, monthKey = $bindable(), edit, accounts, onsaved }: Props = $props();

	const md = $derived(data.months[monthKey]);

	const paychecks = $derived(
		md ? [...md.paychecks].sort((a, b) => a.date.localeCompare(b.date)) : []
	);

	// Donut: where the month's income went — top categories, a rolled-up "Other", and a green
	// Saved slice. The catalog builds the primitive; the registry colours it.
	const donut = $derived(build(data, 'spending.where_it_went', { level: 'month', monthKey }));
	const noIncome = $derived(!!md && md.total_income <= 0);
	// The donut renders "No data" only when the month has neither income nor spending; in that case
	// the pane should collapse to the message (no fill / min-height) like the other empty sections.
	const donutHasData = $derived(!!md && (md.total_income > 0 || md.transactions.length > 0));

	const mo = $derived<Scope>({ level: 'month', monthKey });
	const kpiCells = $derived([
		{ id: 'income.total', scope: mo, cap: 'take-home + saved' },
		{ id: 'spending.total', scope: mo, title: 'Spent', cap: 'this month' },
		{ id: 'saved.total', scope: mo, cap: 'this month' },
		{ id: 'ratio.percent_used', scope: mo, title: '% used', cap: 'of income spent' }
	]);

	let modals: ReturnType<typeof EditModals>;
	let refreshKey = $state(0);

	let sortKey = $state<TxnSort>('date');
	let sortDir = $state<'asc' | 'desc'>('desc');

	// A save also refreshes the pending list (via refreshKey) on top of the page-level refresh.
	function onSaved() {
		refreshKey += 1;
		onsaved();
	}
</script>

<ViewHeader title="Monthly">
	<MonthNav value={monthKey} monthKeys={data.meta.month_keys} onchange={(k) => (monthKey = k)} />
</ViewHeader>

<Board {data} cells={kpiCells} cols={4} />

{#if edit && accounts}
	<div class="card editpanel">
		<div class="ephead">
			<h2 class="serif">Edit · {monthLabel(monthKey)}</h2>
			<div class="epactions">
				<button class="btn-ghost" onclick={() => modals.add()}>+ Add entry</button>
			</div>
		</div>
		<PendingQueue {refreshKey} onedit={(l) => modals.editTransaction(l)} />
	</div>
{/if}

<div class="panes two">
	<Pane
		title="Where your income went"
		cap={md ? `${monthLabel(monthKey)} · net income ${money(md.total_income)}` : ''}
	>
		{#if noIncome}
			<Empty>No income posted this month — showing spending only.</Empty>
		{/if}
		<div class="donutfill" class:fill={donutHasData}>
			<Figure primitive={donut} chart="donut" />
		</div>
	</Pane>
	<div class="rail">
		<Pane
			title="Paychecks this month"
			cap={md ? `${md.paychecks.length} in ${monthLabel(monthKey)}` : ''}
		>
			{#if md && md.paychecks.length}
				<PaycheckList
					{paychecks}
					fields={['gross', 'takehome']}
					{edit}
					onedit={(l) => modals.editPaycheck(l)}
					fixedRows={3}
				/>
			{:else}
				<Empty>No paychecks this month.</Empty>
			{/if}
		</Pane>
		<Pane
			title="Bill pay & transfers"
			cap={md ? `${md.transfers?.length ?? 0} · ${monthLabel(monthKey)}` : ''}
		>
			{#if md?.transfers?.length}
				<TransferList
					transfers={md.transfers}
					{edit}
					onedit={(l) => modals.editTransfer(l)}
					fixedRows={4}
				/>
			{:else}
				<Empty>No bill pay this month.</Empty>
			{/if}
		</Pane>
	</div>
</div>

<div class="panes">
	<Pane
		title="Transaction history"
		cap={md ? `${md.transactions.length} transactions · ${monthLabel(monthKey)}` : ''}
	>
		{#snippet actions()}
			{#if md}<SortMenu fields={TXN_SORTS} bind:sortKey bind:sortDir />{/if}
		{/snippet}
		{#if md && md.transactions.length}
			<TransactionList
				transactions={md.transactions}
				{sortKey}
				{sortDir}
				{edit}
				onedit={(l) => modals.editTransaction(l)}
			/>
		{:else}
			<Empty>No transactions this month.</Empty>
		{/if}
	</Pane>
</div>

<EditModals bind:this={modals} {accounts} onsaved={onSaved} />

<style>
	.editpanel {
		margin-bottom: var(--space-9);
		border-color: color-mix(in srgb, var(--lav) 30%, var(--border));
	}
	.ephead {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--gap-field);
		margin-bottom: var(--gap-field);
		flex-wrap: wrap;
	}
	.ephead h2 {
		font-size: var(--text-panel);
		font-weight: var(--fw-semibold);
		margin: 0;
	}
	.epactions {
		display: flex;
		gap: var(--gap-row);
		flex-wrap: wrap;
	}
	.rail {
		display: flex;
		flex-direction: column;
		gap: var(--gap-grid);
		min-width: 0;
	}
	/* When the donut has data, let it fill the (stretched) pane and become a size-container so Donut
	   can reflow its legend below the ring when there's vertical room. min-height keeps it
	   side-by-side + legible when the pane isn't stretched. Without data the wrapper is inert, so the
	   "No data" message collapses like the other empty sections. */
	.donutfill.fill {
		flex: 1;
		min-height: 260px;
		container-type: size;
	}
	/* Below the two-column breakpoint the panes stack, so the donut is no longer height-constrained
	   by the rail. Drop the size-container there so a full-width donut sizes to its content (ring +
	   legend) instead of being clamped to a fixed height it would overflow. */
	@media (max-width: 900px) {
		.donutfill.fill {
			flex: none;
			min-height: 0;
			container-type: normal;
		}
	}
</style>
