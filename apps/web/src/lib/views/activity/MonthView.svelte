<script lang="ts">
	// Activity · Month — the working view: this month's shape on top, its raw records below.
	// The only Activity range that allows editing, because entries are logged at day/month level.
	import type { DashboardData } from '$lib/data/types';
	import type { AccountsInfo } from '$lib/data/load';
	import type { Scope } from '$lib/data/scope';
	import { money, monthLabel } from '$lib/utils/format';
	import { pendingRows } from '$lib/data/pending';
	import { oneOf, Pref } from '$lib/utils/persist.svelte';
	import Board from '$lib/layout/Board.svelte';
	import Pane from '$lib/ui/Pane.svelte';
	import Figure from '$lib/charts/Figure.svelte';
	import Empty from '$lib/ui/Empty.svelte';
	import TransactionList, { TXN_SORTS, type TxnSort } from '$lib/lists/TransactionList.svelte';
	import TransferList from '$lib/lists/TransferList.svelte';
	import PaycheckList from '$lib/lists/PaycheckList.svelte';
	import SortMenu from '$lib/lists/SortMenu.svelte';
	import { build } from '$lib/data/catalog';
	import EditModals from '$lib/entries/EditModals.svelte';

	interface Props {
		data: DashboardData;
		monthKey: string;
		edit: boolean;
		accounts: AccountsInfo | null;
		onsaved: () => void;
	}
	let { data, monthKey, edit, accounts, onsaved }: Props = $props();

	const md = $derived(data.months[monthKey]);
	const label = $derived(monthLabel(monthKey));
	const mo = $derived<Scope>({ level: 'month', monthKey });

	// Four tiles, four questions, no restatements: what came in · what went out (with its
	// month-over-month change riding along as the delta, not a tile of its own repeating the same
	// figure) · did I live within my means (the % of income used is Saved's note, since "saved" and
	// "% used" are the same fact) · and is this month normal, against a stable trailing average
	// rather than one possibly-freak previous month.
	const kpis = $derived([
		{ id: 'income.total', scope: mo, cap: 'take-home + saved' },
		{
			id: 'change.spending_mom',
			scope: mo,
			title: 'Spent',
			cap: `${md?.transactions.length ?? 0} transactions`
		},
		{ id: 'saved.total', scope: mo, cap: percentUsed() },
		{ id: 'spending.vs_typical', scope: mo }
	]);

	function percentUsed(): string {
		const income = md?.total_income ?? 0;
		if (income <= 0) return 'no income posted';
		return `${Math.round(((md?.total_spent ?? 0) / income) * 100)}% of income used`;
	}

	const donut = $derived(build(data, 'spending.where_it_went', mo));
	const donutHasData = $derived(!!md && (md.total_income > 0 || md.transactions.length > 0));
	const noIncome = $derived(!!md && md.total_income <= 0);

	// Deviation needs prior months to average against; on the first tracked month there's no norm.
	const deviation = $derived(build(data, 'spending.vs_average', mo));
	const hasDeviation = $derived(deviation.kind === 'categorical' && deviation.points.length > 0);

	const paychecks = $derived(
		md ? [...md.paychecks].sort((a, b) => a.date.localeCompare(b.date)) : []
	);
	const pending = $derived(pendingRows(data, monthKey));
	const pendingTotal = $derived(pending.reduce((s, t) => s + t.amount, 0));

	// How you like the history ordered is a preference, not a per-visit choice, so it survives a
	// refresh. Validated against the sort fields that actually exist, so a renamed field falls back
	// to date order rather than leaving the list unsorted.
	const sort = new Pref<TxnSort>('txn-sort', 'date', oneOf(TXN_SORTS.map((s) => s.key)));
	const sortDir = new Pref<'asc' | 'desc'>('txn-sort-dir', 'desc', oneOf(['asc', 'desc'] as const));

	let modals: ReturnType<typeof EditModals>;
</script>

<Board {data} cells={kpis} cols={4} />

<!-- Pending + add, merged: one "needs attention, act here" card. It stays put on clean months
     because it hosts the add button — the empty state reads as reassurance, not absence. -->
<div class="panes">
	<Pane
		title="Pending transactions"
		cap={`${label} · fronted, waiting to be paid back`}
		tone="attention"
	>
		{#snippet actions()}
			<div class="pactions">
				{#if pending.length}
					<span class="meta">{pending.length} · {money(pendingTotal)} out</span>
				{/if}
				{#if edit && accounts}
					<button class="btn-ghost" onclick={() => modals.add()}>+ Add entry</button>
				{/if}
			</div>
		{/snippet}
		{#if pending.length}
			<TransactionList
				transactions={pending}
				{edit}
				onedit={(l) => modals.editTransaction(l)}
				fields={['source']}
			/>
		{:else}
			<Empty>Nothing pending — you're all reconciled.</Empty>
		{/if}
	</Pane>
</div>

<div class="panes two">
	<Pane
		title="Where your income went"
		cap={md ? `${label} · net income ${money(md.total_income)}` : ''}
	>
		{#if noIncome}
			<Empty>No income posted this month — showing spending only.</Empty>
		{/if}
		<div class="donutfill" class:fill={donutHasData}>
			<Figure primitive={donut} chart="donut" />
		</div>
	</Pane>
	<Pane title="Unusual this month" cap="Deviation from your recent monthly average">
		{#if hasDeviation}
			<Figure primitive={deviation} chart="diverging-bars" />
		{:else}
			<Empty>Not enough history yet to know what's normal.</Empty>
		{/if}
	</Pane>
</div>

<div class="panes two">
	<Pane title="Paychecks" cap={`${md?.paychecks.length ?? 0} in ${label}`}>
		{#snippet actions()}
			{#if edit && accounts}
				<button class="btn-ghost" onclick={() => modals.add('paycheck')}>+ Add</button>
			{/if}
		{/snippet}
		{#if paychecks.length}
			<PaycheckList
				{paychecks}
				fields={['gross', 'takehome']}
				{edit}
				onedit={(l) => modals.editPaycheck(l)}
				fixedRows={3}
				prefKey="month-paychecks"
			/>
		{:else}
			<Empty>No paychecks this month.</Empty>
		{/if}
	</Pane>
	<Pane title="Bill pay &amp; transfers" cap={`${md?.transfers?.length ?? 0} in ${label}`}>
		{#snippet actions()}
			{#if edit && accounts}
				<button class="btn-ghost" onclick={() => modals.add('transfer')}>+ Add</button>
			{/if}
		{/snippet}
		{#if md?.transfers?.length}
			<TransferList
				transfers={md.transfers}
				{edit}
				onedit={(l) => modals.editTransfer(l)}
				fixedRows={3}
				prefKey="month-transfers"
			/>
		{:else}
			<Empty>No bill pay this month.</Empty>
		{/if}
	</Pane>
</div>

<div class="panes">
	<Pane title="Transaction history" cap={`${md?.transactions.length ?? 0} · ${label}`}>
		{#snippet actions()}
			<div class="pactions">
				{#if md}
					<SortMenu
						fields={TXN_SORTS}
						bind:sortKey={() => sort.value, (v) => (sort.value = v)}
						bind:sortDir={() => sortDir.value, (v) => (sortDir.value = v)}
					/>
				{/if}
				{#if edit && accounts}
					<button class="btn-ghost" onclick={() => modals.add('transaction')}>+ Add</button>
				{/if}
			</div>
		{/snippet}
		{#if md && md.transactions.length}
			<TransactionList
				transactions={md.transactions}
				sortKey={sort.value}
				sortDir={sortDir.value}
				{edit}
				onedit={(l) => modals.editTransaction(l)}
			/>
		{:else}
			<Empty>No transactions this month.</Empty>
		{/if}
	</Pane>
</div>

<EditModals
	bind:this={modals}
	{accounts}
	{onsaved}
	kinds={['transaction', 'paycheck', 'transfer']}
/>

<style>
	.pactions {
		display: flex;
		gap: var(--gap-row);
		align-items: center;
		flex-wrap: wrap;
	}
	.meta {
		color: var(--ink-3);
		font-size: var(--text-secondary);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	/* Let the donut fill its (stretched) pane and become a size-container so its legend can reflow
	   below the ring when there's vertical room; min-height keeps it legible when unstretched. */
	.donutfill.fill {
		flex: 1;
		min-height: 260px;
		container-type: size;
	}
	/* Stacked panes no longer constrain height, so let a full-width donut size to its content. */
	@media (max-width: 900px) {
		.donutfill.fill {
			flex: none;
			min-height: 0;
			container-type: normal;
		}
	}
</style>
