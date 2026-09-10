<script lang="ts">
	// Activity · Month — the working view: this month's shape on top, its raw records below.
	//
	// One table says what this view is: every pane, where it starts, who owns its height, and what it
	// draws. That is only the DEFAULT — the board is the user's to rearrange, and what they settle on
	// is stored under this view and range's own key.
	import type { DashboardData } from '$lib/data/types';
	import type { AccountsInfo } from '$lib/data/load';
	import type { Scope } from '$lib/data/scope';
	import type { BoardLayout } from '$lib/layout/grid/types';
	import { money, monthLabel } from '$lib/utils/format';
	import { pendingRows } from '$lib/data/pending';
	import { oneOf, Pref } from '$lib/utils/persist.svelte';
	import Board from '$lib/layout/grid/Board.svelte';
	import Pane from '$lib/layout/grid/Pane.svelte';
	import FigurePane from '$lib/layout/grid/FigurePane.svelte';
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
	// neighbour take a set height so the row keeps its line and scroll once the month is busy; the
	// history below has nothing to line up with and nothing under it, so it simply fits its content.
	//
	// Four tiles, four questions, no restatements: what came in · what went out (with its
	// month-over-month change riding along as the delta, not a tile of its own repeating the same
	// figure) · did I live within my means (the % of income used is Saved's note, since "saved" and
	// "% used" are the same fact) · and is this month normal, against a stable trailing average
	// rather than one possibly-freak previous month.
	const PANES = $derived({
		income: {
			x: 0,
			y: 0,
			w: 12,
			h: 6,
			content: 'scale',
			figure: { figure: 'income.total', scope: mo, caption: 'take-home + saved' }
		},
		spent: {
			x: 12,
			y: 0,
			w: 12,
			h: 6,
			content: 'scale',
			figure: {
				figure: 'change.spending_mom',
				scope: mo,
				title: 'Spent',
				caption: `${md?.transactions.length ?? 0} transactions`
			}
		},
		saved: {
			x: 24,
			y: 0,
			w: 12,
			h: 6,
			content: 'scale',
			figure: { figure: 'saved.total', scope: mo, caption: percentUsed() }
		},
		typical: {
			x: 36,
			y: 0,
			w: 12,
			h: 6,
			content: 'scale',
			figure: { figure: 'spending.vs_typical', scope: mo }
		},
		pending: { x: 0, y: 6, w: 48, h: 9, content: 'flow', mode: 'fixed' },
		donut: {
			x: 0,
			y: 15,
			w: 28,
			h: 14,
			content: 'scale',
			figure: {
				figure: 'spending.where_it_went',
				scope: mo,
				chart: 'donut',
				title: 'Where your income went',
				caption: donutCaption()
			}
		},
		unusual: { x: 28, y: 15, w: 20, h: 14, content: 'scale' },
		paychecks: { x: 0, y: 29, w: 24, h: 10, content: 'flow', mode: 'fixed' },
		transfers: { x: 24, y: 29, w: 24, h: 10, content: 'flow', mode: 'fixed' },
		history: { x: 0, y: 39, w: 48, h: 20, content: 'flow', mode: 'fit' }
	} satisfies BoardLayout);

	function percentUsed(): string {
		const income = md?.total_income ?? 0;
		if (income <= 0) return 'no income posted';
		return `${Math.round(((md?.total_spent ?? 0) / income) * 100)}% of income used`;
	}

	/** A month with no income posted still has spending to show; the subtitle says which it is, so the
	    figure doesn't need a note of its own above it. */
	function donutCaption(): string {
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

<Board key="activity:month" layout={PANES}>
	<!-- Written out one by one rather than looped over the table: the donut is a figure too, but it
	     belongs BELOW the pending list, and a loop over the figures would pull it up here. -->
	<FigurePane id="income" {data} spec={PANES.income.figure} />
	<FigurePane id="spent" {data} spec={PANES.spent.figure} />
	<FigurePane id="saved" {data} spec={PANES.saved.figure} />
	<FigurePane id="typical" {data} spec={PANES.typical.figure} />

	<PendingPane
		id="pending"
		transactions={pending}
		caption={`${label} · fronted, waiting to be paid back`}
		onedit={(l) => modals.editTransaction(l)}
		onadd={() => modals.add()}
	/>

	<!-- The donut's legend moves beside or under the ring as this pane's shape changes (the chart owns
	     that reflow), and THAT is why its minimum can't be a declared pair of numbers: dropping the
	     keys underneath needs MORE height, not less, and where it turns over depends on how many
	     categories there are. The resize probes the DOM instead. -->
	<FigurePane id="donut" {data} spec={PANES.donut.figure} />

	<Pane
		id="unusual"
		title="Unusual this month"
		caption="Deviation from your recent monthly average"
	>
		{#if hasDeviation}
			<Figure primitive={deviation} chart="diverging-bars" />
		{:else}
			<Empty>Not enough history yet to know what's normal.</Empty>
		{/if}
	</Pane>

	<Pane id="paychecks" title="Paychecks" caption={`${md?.paychecks.length ?? 0} in ${label}`}>
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
	</Pane>

	<Pane
		id="transfers"
		title="Bill pay &amp; transfers"
		caption={`${md?.transfers?.length ?? 0} in ${label}`}
	>
		{#snippet actions()}
			<button class="btn-ghost" onclick={() => modals.add('transfer')}>+ Add</button>
		{/snippet}
		{#if md?.transfers?.length}
			<TransferList transfers={md.transfers} onedit={(l) => modals.editTransfer(l)} />
		{:else}
			<Empty>No bill pay this month.</Empty>
		{/if}
	</Pane>

	<Pane
		id="history"
		title="Transaction history"
		caption={`${md?.transactions.length ?? 0} · ${label}`}
	>
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
	</Pane>
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
