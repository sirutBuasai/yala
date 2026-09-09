<script lang="ts">
	// Activity · Month — the working view: this month's shape on top, its raw records below.
	//
	// Two tables say what this view is: LAYOUT is where each pane starts and who owns its height,
	// FIGURES is what the chart panes draw. Both are only defaults — the board is the user's to
	// rearrange, and what they settle on is stored under this view and range's own key.
	import type { DashboardData } from '$lib/data/types';
	import type { AccountsInfo } from '$lib/data/load';
	import type { Scope } from '$lib/data/scope';
	import type { Layout } from '$lib/layout/grid/types';
	import { money, monthLabel } from '$lib/utils/format';
	import { pendingRows } from '$lib/data/pending';
	import { oneOf, Pref } from '$lib/utils/persist.svelte';
	import Board from '$lib/layout/grid/Board.svelte';
	import Cell from '$lib/layout/grid/Cell.svelte';
	import FigureCell, { type FigureSpec } from '$lib/layout/grid/FigureCell.svelte';
	import Figure from '$lib/charts/Figure.svelte';
	import Empty from '$lib/ui/Empty.svelte';
	import TransactionList, { TXN_SORTS, type TxnSort } from '$lib/lists/TransactionList.svelte';
	import TransferList from '$lib/lists/TransferList.svelte';
	import PaycheckList from '$lib/lists/PaycheckList.svelte';
	import PendingPane from '$lib/lists/PendingPane.svelte';
	import SortMenu from '$lib/lists/SortMenu.svelte';
	import { build } from '$lib/data/catalog';
	import EditModals from '$lib/entries/EditModals.svelte';

	interface Props {
		data: DashboardData;
		monthKey: string;
		accounts: AccountsInfo | null;
		onsaved: () => void;
	}
	let { data, monthKey, accounts, onsaved }: Props = $props();

	const md = $derived(data.months[monthKey]);
	const label = $derived(monthLabel(monthKey));
	const mo = $derived<Scope>({ level: 'month', monthKey });

	// A row of four stat panes, then the month's shape, then its records. The lists that sit beside a
	// neighbour are capped so the row keeps a line; the history below has nothing to line up with, so
	// it takes a set height and scrolls.
	const LAYOUT = {
		income: { x: 0, y: 0, w: 12, h: 6, content: 'scale' },
		spent: { x: 12, y: 0, w: 12, h: 6, content: 'scale' },
		saved: { x: 24, y: 0, w: 12, h: 6, content: 'scale' },
		typical: { x: 36, y: 0, w: 12, h: 6, content: 'scale' },
		pending: { x: 0, y: 6, w: 48, h: 10, content: 'flow', mode: 'cap', cap: 10 },
		donut: { x: 0, y: 16, w: 24, h: 16, content: 'scale' },
		unusual: { x: 24, y: 16, w: 24, h: 16, content: 'scale' },
		paychecks: { x: 0, y: 32, w: 24, h: 11, content: 'flow', mode: 'cap', cap: 11 },
		transfers: { x: 24, y: 32, w: 24, h: 11, content: 'flow', mode: 'cap', cap: 11 },
		history: { x: 0, y: 42, w: 48, h: 20, content: 'flow', mode: 'fixed' }
	} satisfies Layout;

	// Four tiles, four questions, no restatements: what came in · what went out (with its
	// month-over-month change riding along as the delta, not a tile of its own repeating the same
	// figure) · did I live within my means (the % of income used is Saved's note, since "saved" and
	// "% used" are the same fact) · and is this month normal, against a stable trailing average
	// rather than one possibly-freak previous month.
	const FIGURES = $derived<Record<string, FigureSpec>>({
		income: { figure: 'income.total', scope: mo, cap: 'take-home + saved' },
		spent: {
			figure: 'change.spending_mom',
			scope: mo,
			title: 'Spent',
			cap: `${md?.transactions.length ?? 0} transactions`
		},
		saved: { figure: 'saved.total', scope: mo, cap: percentUsed() },
		typical: { figure: 'spending.vs_typical', scope: mo },
		donut: {
			figure: 'spending.where_it_went',
			scope: mo,
			chart: 'donut',
			title: 'Where your income went',
			cap: donutCap()
		}
	});

	function percentUsed(): string {
		const income = md?.total_income ?? 0;
		if (income <= 0) return 'no income posted';
		return `${Math.round(((md?.total_spent ?? 0) / income) * 100)}% of income used`;
	}

	/** A month with no income posted still has spending to show; the subtitle says which it is, so the
	    figure doesn't need a note of its own above it. */
	function donutCap(): string {
		if (!md) return '';
		if (md.total_income <= 0) return `${label} · no income posted — spending only`;
		return `${label} · net income ${money(md.total_income)}`;
	}

	// Deviation needs prior months to average against; on the first tracked month there's no norm.
	const deviation = $derived(build(data, 'spending.vs_average', mo));
	const hasDeviation = $derived(deviation.kind === 'categorical' && deviation.points.length > 0);

	const paychecks = $derived(
		md ? [...md.paychecks].sort((a, b) => a.date.localeCompare(b.date)) : []
	);
	const pending = $derived(pendingRows(data, monthKey));

	// How you like the history ordered is a preference, not a per-visit choice, so it survives a
	// refresh. Validated against the sort fields that actually exist, so a renamed field falls back
	// to date order rather than leaving the list unsorted.
	const sort = new Pref<TxnSort>('txn-sort', 'date', oneOf(TXN_SORTS.map((s) => s.key)));
	const sortDir = new Pref<'asc' | 'desc'>('txn-sort-dir', 'desc', oneOf(['asc', 'desc'] as const));

	let modals: ReturnType<typeof EditModals>;
</script>

<Board key="activity:month" layout={LAYOUT}>
	{#each ['income', 'spent', 'saved', 'typical'] as id (id)}
		<FigureCell {id} {data} spec={FIGURES[id]!} />
	{/each}

	<PendingPane
		id="pending"
		transactions={pending}
		cap={`${label} · fronted, waiting to be paid back`}
		onedit={(l) => modals.editTransaction(l)}
		onadd={() => modals.add()}
	/>

	<!-- The donut's legend moves beside or under the ring as this pane's shape changes (the chart owns
	     that reflow), and THAT is why its minimum can't be a declared pair of numbers: dropping the
	     keys underneath needs MORE height, not less, and where it turns over depends on how many
	     categories there are. The resize probes the DOM instead. -->
	<FigureCell id="donut" {data} spec={FIGURES.donut!} />

	<Cell id="unusual" title="Unusual this month" cap="Deviation from your recent monthly average">
		{#if hasDeviation}
			<Figure primitive={deviation} chart="diverging-bars" />
		{:else}
			<Empty>Not enough history yet to know what's normal.</Empty>
		{/if}
	</Cell>

	<Cell id="paychecks" title="Paychecks" cap={`${md?.paychecks.length ?? 0} in ${label}`}>
		{#snippet actions()}
			<button class="btn-ghost" onclick={() => modals.add('paycheck')}>+ Add</button>
		{/snippet}
		{#if paychecks.length}
			<PaycheckList
				{paychecks}
				fields={['gross', 'takehome']}
				onedit={(l) => modals.editPaycheck(l)}
			/>
		{:else}
			<Empty>No paychecks this month.</Empty>
		{/if}
	</Cell>

	<Cell
		id="transfers"
		title="Bill pay &amp; transfers"
		cap={`${md?.transfers?.length ?? 0} in ${label}`}
	>
		{#snippet actions()}
			<button class="btn-ghost" onclick={() => modals.add('transfer')}>+ Add</button>
		{/snippet}
		{#if md?.transfers?.length}
			<TransferList transfers={md.transfers} onedit={(l) => modals.editTransfer(l)} />
		{:else}
			<Empty>No bill pay this month.</Empty>
		{/if}
	</Cell>

	<Cell id="history" title="Transaction history" cap={`${md?.transactions.length ?? 0} · ${label}`}>
		{#snippet actions()}
			<div class="pactions">
				{#if md}
					<SortMenu
						fields={TXN_SORTS}
						bind:sortKey={() => sort.value, (v) => (sort.value = v)}
						bind:sortDir={() => sortDir.value, (v) => (sortDir.value = v)}
					/>
				{/if}
				<button class="btn-ghost" onclick={() => modals.add('transaction')}>+ Add</button>
			</div>
		{/snippet}
		{#if md && md.transactions.length}
			<TransactionList
				transactions={md.transactions}
				sortKey={sort.value}
				sortDir={sortDir.value}
				onedit={(l) => modals.editTransaction(l)}
			/>
		{:else}
			<Empty>No transactions this month.</Empty>
		{/if}
	</Cell>
</Board>

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
</style>
