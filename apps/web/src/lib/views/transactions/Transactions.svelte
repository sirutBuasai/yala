<script lang="ts">
	// Transactions: log a month and check it as you go (docs/redesign/specs/transactions.md). Every pane is
	// carried over from Home and Activity unchanged; the layout here is only the default, since what the
	// user arranges is stored under this board's key.
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import type { DashboardData } from '$lib/data/types';
	import type { AccountsInfo } from '$lib/data/load';
	import type { Scope } from '$lib/data/scope';
	import type { KpiBoardDefs } from '$lib/kpi/spec';
	import { latestMonthKey } from '$lib/data/scope';
	import { pendingRows } from '$lib/data/pending';
	import { build } from '$lib/data/catalog';
	import { dateShort, monthLabel, MONTHS } from '$lib/utils/format';
	import { monthOf, yearOf } from '$lib/utils/period';
	import { oneOf, Pref } from '$lib/utils/persist.svelte';
	import { focusMonth, MONTH_PARAM, withParams } from '$lib/nav/focus';
	import ViewHeader from '$lib/layout/ViewHeader.svelte';
	import Board from '$lib/layout/grid/Board.svelte';
	import Pane from '$lib/layout/grid/Pane.svelte';
	import FigurePane from '$lib/layout/grid/FigurePane.svelte';
	import { useKpiBoard } from '$lib/kpi/context';
	import KpiCards from '$lib/kpi/KpiCards.svelte';
	import MonthNav from '$lib/nav/MonthNav.svelte';
	import Figure from '$lib/charts/Figure.svelte';
	import Empty from '$lib/ui/Empty.svelte';
	import CalendarPanes from '$lib/calendar/CalendarPanes.svelte';
	import PendingPane from '$lib/lists/PendingPane.svelte';
	import TransactionList, { TXN_SORTS, type TxnSort } from '$lib/lists/TransactionList.svelte';
	import TransferList from '$lib/lists/TransferList.svelte';
	import PaycheckList from '$lib/lists/PaycheckList.svelte';
	import SortMenu from '$lib/lists/SortMenu.svelte';
	import EditModals from '$lib/entries/EditModals.svelte';
	import { live, words } from '$lib/ui/label';

	interface Props {
		data: DashboardData;
		accounts: AccountsInfo | null;
		onsaved: () => void;
	}
	let { data, accounts, onsaved }: Props = $props();

	const DAY_PARAM = 'day';

	const monthKey = $derived(focusMonth($page.url, latestMonthKey(data)));
	const day = $derived($page.url.searchParams.get(DAY_PARAM) ?? '');

	/** Every step is its own history entry (D9), so back undoes it. */
	function navigate(patch: Record<string, string | null>) {
		void goto(withParams($page.url, patch), { keepFocus: true, noScroll: true });
	}

	const md = $derived(data.months[monthKey]);
	const label = $derived(monthLabel(monthKey));
	const mo = $derived<Scope>({ level: 'month', monthKey });
	const yr = $derived<Scope>({ level: 'year', year: yearOf(monthKey) });

	// Two columns, each read top to bottom: what came in, what reached the account, what was kept, then what
	// went out, how that sits against a usual month, and the share of income it took.
	const KPIS = $derived<KpiBoardDefs>({
		income: {
			rect: { x: 0, y: 0, w: 8, h: 5 },
			spec: { figure: 'change.income_mom', scope: mo, chart: 'bar', series: 'trend.income' }
		},
		// Captionless on purpose: read between income and saved, the figure needs no gloss.
		takehome: {
			rect: { x: 0, y: 5, w: 8, h: 6 },
			spec: {
				figure: 'income.takehome',
				scope: mo,
				chart: 'bar',
				series: 'trend.takehome',
				caption: words('')
			}
		},
		saved: {
			rect: { x: 0, y: 11, w: 8, h: 5 },
			spec: { figure: 'change.saved_mom', scope: mo, chart: 'bar', series: 'trend.saved' }
		},
		spent: {
			rect: { x: 8, y: 0, w: 8, h: 5 },
			spec: { figure: 'change.spending_mom', scope: mo, chart: 'bar', series: 'trend.spending' }
		},
		typical: {
			rect: { x: 8, y: 5, w: 8, h: 6 },
			spec: { figure: 'spending.vs_typical', scope: mo }
		},
		spendingRate: {
			rect: { x: 8, y: 11, w: 8, h: 5 },
			spec: { figure: 'ratio.spending_rate', scope: mo, chart: 'ring' }
		}
	});

	const kpis = useKpiBoard('transactions', () => KPIS, [
		{ ids: ['income', 'takehome', 'saved'], axis: 'column' },
		{ ids: ['spent', 'typical', 'spendingRate'], axis: 'column' }
	]);

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
			// The spreadsheet's month-by-category summary: the focus month's row is its Total row, how much
			// each category has taken so far.
			heatmap: {
				x: 0,
				y: 16,
				w: 48,
				h: 18,
				content: 'scale',
				figure: {
					figure: 'spending.category_by_month',
					scope: yr,
					chart: 'heatmap',
					normalize: 'col',
					mark: MONTHS[monthOf(monthKey) - 1],
					title: words('Category by month'),
					caption: words('category spending split per month')
				}
			},
			// The calendar is a chart: it scales to its pane. The day's entries and pending sit beside it at a
			// set height, so each holds still between a quiet day and a busy one and scrolls instead.
			calendar: { x: 0, y: 34, w: 31, h: 26, content: 'scale' },
			pending: { x: 31, y: 34, w: 17, h: 10, content: 'flow', mode: 'fixed' },
			day: { x: 31, y: 44, w: 17, h: 16, content: 'flow', mode: 'fixed' },
			// Capped rather than fitted: a busy month would otherwise run the board on for screens.
			history: { x: 0, y: 60, w: 48, h: 20, content: 'flow', mode: 'cap', cap: 39 },
			paychecks: { x: 0, y: 80, w: 24, h: 10, content: 'flow', mode: 'fixed' },
			transfers: { x: 24, y: 80, w: 24, h: 10, content: 'flow', mode: 'fixed' }
		})
	);

	// Deviation needs prior months to average against, so the first tracked month has no norm.
	const deviation = $derived(build(data, 'spending.vs_average', mo));
	const hasDeviation = $derived(deviation.kind === 'deviation' && deviation.rows.length > 0);

	// Every outstanding row, not just this month's: a pending charge waits whichever month it was logged in.
	const pending = $derived(pendingRows(data));
	const paychecks = $derived(
		md ? [...md.paychecks].sort((a, b) => a.date.localeCompare(b.date)) : []
	);

	// Validated against the sort fields that exist, so a renamed one falls back to date order.
	const sort = new Pref<TxnSort>('txn-sort', 'date', oneOf(TXN_SORTS.map((s) => s.key)));
	const sortDir = new Pref<'asc' | 'desc'>('txn-sort-dir', 'desc', oneOf(['asc', 'desc'] as const));

	const countIn = (n: number) => live(`${n} in ${label}`);

	let modals: ReturnType<typeof EditModals>;
	let addDate = $state('');

	function add(kind?: 'transaction' | 'paycheck' | 'transfer', iso = '') {
		addDate = iso;
		modals.add(kind);
	}
	const addTitle = $derived(addDate ? `Add entry · ${dateShort(addDate)}` : 'Add entry');
</script>

<ViewHeader title="Transactions">
	<MonthNav
		value={monthKey}
		monthKeys={data.meta.month_keys}
		onchange={(k) => navigate({ [MONTH_PARAM]: k, [DAY_PARAM]: null })}
	/>
	{#snippet actions()}
		<button class="btn-accent pill" onclick={() => add()}>+ Add entry</button>
	{/snippet}
</ViewHeader>

<Board key="transactions" layout={PANES} names={Object.keys(KPIS)} onreset={() => kpis.reset()}>
	<KpiCards {data} />

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

	<FigurePane id="heatmap" {data} spec={PANES.heatmap.figure} />

	<CalendarPanes
		{data}
		{monthKey}
		{day}
		onpick={(iso) => navigate({ [DAY_PARAM]: iso })}
		onadd={(iso) => add(undefined, iso)}
		oneditTransaction={(l) => modals.editTransaction(l)}
		oneditPaycheck={(l) => modals.editPaycheck(l)}
		oneditTransfer={(l) => modals.editTransfer(l)}
	/>

	<PendingPane
		id="pending"
		transactions={pending}
		caption={words('waiting for posting, refunds, or credits')}
		onedit={(l) => modals.editTransaction(l)}
	/>

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
				<button class="btn-ghost" onclick={() => add('transaction')}>+ Add</button>
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

	<Pane id="paychecks" title={words('Paychecks')} caption={countIn(md?.paychecks.length ?? 0)}>
		{#snippet actions()}
			<button class="btn-ghost" onclick={() => add('paycheck')}>+ Add</button>
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
			<button class="btn-ghost" onclick={() => add('transfer')}>+ Add</button>
		{/snippet}
		{#if md?.transfers?.length}
			<TransferList transfers={md.transfers} onedit={(l) => modals.editTransfer(l)} />
		{:else}
			<Empty>No bill pay this month.</Empty>
		{/if}
	</Pane>
</Board>

<EditModals
	bind:this={modals}
	{accounts}
	{onsaved}
	kinds={['transaction', 'paycheck', 'transfer']}
	presetDate={addDate || undefined}
	{addTitle}
/>

<style>
	.pactions {
		display: flex;
		gap: var(--gap-row);
		align-items: center;
		flex-wrap: wrap;
	}
</style>
