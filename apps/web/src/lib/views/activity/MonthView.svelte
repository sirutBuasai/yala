<script lang="ts">
	// Activity · Month — the working view: this month's shape on top, its raw records below. The layout
	// here is only the default; what the user rearranges is stored under this view and range's key.
	import type { DashboardData } from '$lib/data/types';
	import type { AccountsInfo } from '$lib/data/load';
	import type { Scope } from '$lib/data/scope';
	import type { KpiBoardDefs } from '$lib/kpi/spec';
	import { monthLabel } from '$lib/utils/format';
	import { pendingRows } from '$lib/data/pending';
	import { oneOf, Pref } from '$lib/utils/persist.svelte';
	import Board from '$lib/layout/grid/Board.svelte';
	import Pane from '$lib/layout/grid/Pane.svelte';
	import FigurePane from '$lib/layout/grid/FigurePane.svelte';
	import { useKpiBoard } from '$lib/kpi/context';
	import KpiCards from '$lib/kpi/KpiCards.svelte';
	import Figure from '$lib/charts/Figure.svelte';
	import Empty from '$lib/ui/Empty.svelte';
	import TransactionList, { TXN_SORTS, type TxnSort } from '$lib/lists/TransactionList.svelte';
	import TransferList from '$lib/lists/TransferList.svelte';
	import PaycheckList from '$lib/lists/PaycheckList.svelte';
	import PendingPane from '$lib/lists/PendingPane.svelte';
	import SortMenu from '$lib/lists/SortMenu.svelte';
	import { build } from '$lib/data/catalog';
	import EditModals from '$lib/entries/EditModals.svelte';
	import { live, words } from '$lib/ui/label';

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

	// Two rows: the month's three levels with how they moved and the year's shape behind each, then the
	// three rates that say how it was run. A ring on the two that are shares of income; "vs average" is
	// already a signed deviation, so a chart would only restate it.
	const KPIS = $derived<KpiBoardDefs>({
		income: {
			rect: { x: 0, y: 0, w: 8, h: 5 },
			spec: { figure: 'change.income_mom', scope: mo, chart: 'bar', series: 'trend.income' }
		},
		spent: {
			rect: { x: 0, y: 5, w: 8, h: 5 },
			spec: { figure: 'change.spending_mom', scope: mo, chart: 'bar', series: 'trend.spending' }
		},
		saved: {
			rect: { x: 0, y: 10, w: 8, h: 6 },
			spec: { figure: 'change.saved_mom', scope: mo, chart: 'bar', series: 'trend.saved' }
		},
		typical: {
			rect: { x: 8, y: 0, w: 8, h: 5 },
			spec: { figure: 'spending.vs_typical', scope: mo }
		},
		spendingRate: {
			rect: { x: 8, y: 5, w: 8, h: 5 },
			spec: { figure: 'ratio.spending_rate', scope: mo, chart: 'ring' }
		},
		savingsRate: {
			rect: { x: 8, y: 10, w: 8, h: 6 },
			spec: { figure: 'ratio.savings_rate', scope: mo, chart: 'ring' }
		}
	});

	// Two stacks beside the month's shape: the three levels, then the rates that judge them.
	const kpis = useKpiBoard('activity:month', () => KPIS, [
		{ ids: ['income', 'spent', 'saved'], axis: 'column' },
		{ ids: ['typical', 'spendingRate', 'savingsRate'], axis: 'column' }
	]);

	// A list beside a neighbour takes a set height, so the row keeps its line and scrolls once the month
	// is busy; the history below has nothing to line up with, so it fits its content.
	const PANES = $derived(
		kpis.board({
			donut: {
				x: 16,
				y: 0,
				w: 21,
				h: 16,
				content: 'scale',
				figure: {
					figure: 'spending.where_it_went',
					scope: mo,
					chart: 'donut',
					title: words('Where your income went'),
					caption: { context: label, text: 'income and spending split' }
				}
			},
			unusual: { x: 37, y: 0, w: 11, h: 16, content: 'scale' },
			pending: { x: 0, y: 16, w: 48, h: 9, content: 'flow', mode: 'fixed' },
			paychecks: { x: 0, y: 25, w: 24, h: 10, content: 'flow', mode: 'fixed' },
			transfers: { x: 24, y: 25, w: 24, h: 10, content: 'flow', mode: 'fixed' },
			history: { x: 0, y: 35, w: 48, h: 20, content: 'flow', mode: 'fit' }
		})
	);

	// Deviation needs prior months to average against, so the first tracked month has no norm.
	const deviation = $derived(build(data, 'spending.vs_average', mo));
	const hasDeviation = $derived(deviation.kind === 'deviation' && deviation.rows.length > 0);

	const paychecks = $derived(
		md ? [...md.paychecks].sort((a, b) => a.date.localeCompare(b.date)) : []
	);
	const pending = $derived(pendingRows(data, monthKey));

	// Validated against the sort fields that exist, so a renamed one falls back to date order.
	const sort = new Pref<TxnSort>('txn-sort', 'date', oneOf(TXN_SORTS.map((s) => s.key)));
	const sortDir = new Pref<'asc' | 'desc'>('txn-sort-dir', 'desc', oneOf(['asc', 'desc'] as const));

	const countIn = (n: number) => live(`${n} in ${label}`);

	let modals: ReturnType<typeof EditModals>;
</script>

<Board key="activity:month" layout={PANES} names={Object.keys(KPIS)} onreset={() => kpis.reset()}>
	<KpiCards {data} />

	<PendingPane
		id="pending"
		transactions={pending}
		caption={{ context: label, text: 'waiting for posting, refunds, or credits' }}
		onedit={(l) => modals.editTransaction(l)}
		onadd={() => modals.add()}
	/>

	<!-- The chart reflows its legend beside or under the ring, so this pane's minimum can't be declared:
	     dropping the keys underneath needs MORE height, not less. The resize probes the DOM instead. -->
	<FigurePane id="donut" {data} spec={PANES.donut.figure} />

	<Pane
		id="unusual"
		title={words('Unusual this month')}
		caption={words('deviation from monthly averages')}
	>
		{#if hasDeviation}
			<Figure primitive={deviation} chart="dumbbell" />
		{:else}
			<Empty>Not enough history yet to know what's normal.</Empty>
		{/if}
	</Pane>

	<Pane id="paychecks" title={words('Paychecks')} caption={countIn(md?.paychecks.length ?? 0)}>
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
		title={words('Bill pay & transfers')}
		caption={countIn(md?.transfers?.length ?? 0)}
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
		title={words('Transaction history')}
		caption={countIn(md?.transactions.length ?? 0)}
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
