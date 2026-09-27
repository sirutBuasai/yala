<script lang="ts">
	// A rearrangement is stored under this board's key.
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
	import { focusMonth, MONTH_PARAM } from '$lib/nav/focus';
	import { step } from '$lib/nav/step';
	import {
		historyOf,
		type EntryType,
		type HistoryEntry,
		type HistoryFilter
	} from '$lib/lists/history';
	import ViewHeader from '$lib/layout/ViewHeader.svelte';
	import Board from '$lib/layout/grid/Board.svelte';
	import FigurePane from '$lib/layout/grid/FigurePane.svelte';
	import { useKpiBoard } from '$lib/kpi/context';
	import KpiCards from '$lib/kpi/KpiCards.svelte';
	import MonthNav from '$lib/nav/MonthNav.svelte';
	import CalendarPanes from '$lib/calendar/CalendarPanes.svelte';
	import PendingPane from '$lib/lists/PendingPane.svelte';
	import HistoryPane from '$lib/lists/HistoryPane.svelte';
	import EditModals from '$lib/entries/EditModals.svelte';
	import { words } from '$lib/ui/label';
	import { onKey } from '$lib/utils/keys';
	import { isShortcut } from '$lib/utils/shortcut';

	interface Props {
		data: DashboardData;
		accounts: AccountsInfo | null;
		onsaved: () => void;
	}
	let { data, accounts, onsaved }: Props = $props();

	// Page state in the URL, beside the shared `month`.
	const P = {
		day: 'day',
		type: 'type',
		category: 'category',
		account: 'account',
		search: 'q'
	} as const;
	const ENTRY_TYPES: EntryType[] = ['txn', 'pay', 'xfer'];

	const params = $derived($page.url.searchParams);
	const monthKey = $derived(focusMonth($page.url, latestMonthKey(data)));
	// A day outside the focus month is one the page was left at before the month moved on.
	const day = $derived.by(() => {
		const d = params.get(P.day) ?? '';
		return d.startsWith(`${monthKey}-`) ? d : '';
	});
	const filter = $derived<HistoryFilter>({
		type: ENTRY_TYPES.find((t) => t === params.get(P.type)) ?? null,
		category: params.get(P.category),
		account: params.get(P.account),
		search: params.get(P.search) ?? ''
	});

	const navigate = (patch: Record<string, string | null>, replace = false) =>
		step($page.url, patch, { replace });

	function setFilter(patch: Partial<HistoryFilter>) {
		const next = { ...filter, ...patch };
		navigate(
			{
				[P.type]: next.type,
				[P.category]: next.category,
				[P.account]: next.account,
				[P.search]: next.search || null
			},
			'search' in patch
		);
	}

	const label = $derived(monthLabel(monthKey));
	const mo = $derived<Scope>({ level: 'month', monthKey });
	const yr = $derived<Scope>({ level: 'year', year: yearOf(monthKey) });

	// One thin bar across the top: each figure is its own KPI card, opened merged along a row, so the
	// bar splits and rearranges like any other card.
	const KPIS = $derived<KpiBoardDefs>({
		income: {
			rect: { x: 0, y: 0, w: 12, h: 5 },
			spec: { figure: 'vsavg.income', scope: mo, chart: 'bar', series: 'trend.income' }
		},
		takehome: {
			rect: { x: 12, y: 0, w: 12, h: 5 },
			spec: { figure: 'vsavg.takehome', scope: mo, chart: 'bar', series: 'trend.takehome' }
		},
		saved: {
			rect: { x: 24, y: 0, w: 12, h: 5 },
			spec: { figure: 'vsavg.saved', scope: mo, chart: 'bar', series: 'trend.saved' }
		},
		spent: {
			rect: { x: 36, y: 0, w: 12, h: 5 },
			spec: { figure: 'vsavg.spending', scope: mo, chart: 'bar', series: 'trend.spending' }
		}
	});

	const kpis = useKpiBoard('transactions', () => KPIS, [
		{ ids: ['income', 'takehome', 'saved', 'spent'], axis: 'row' }
	]);

	const PANES = $derived(
		kpis.board({
			// The calendar is a chart: it scales to its pane. The day's entries and pending sit beside it at a
			// set height, so each holds still between a quiet day and a busy one and scrolls instead.
			calendar: { x: 0, y: 5, w: 31, h: 26, content: 'scale' },
			pending: { x: 31, y: 5, w: 17, h: 11, content: 'flow', mode: 'fixed' },
			day: { x: 31, y: 16, w: 17, h: 15, content: 'flow', mode: 'fixed' },
			history: { x: 0, y: 31, w: 28, h: 29, content: 'flow', mode: 'fixed' },
			categories: {
				x: 28,
				y: 31,
				w: 20,
				h: 16,
				content: 'scale',
				figure: {
					figure: 'spending.vs_average',
					scope: mo,
					chart: 'range-bars',
					title: words('Spending by category'),
					caption: { context: label, text: 'total and deviation from monthly averages' }
				}
			},
			donut: {
				x: 28,
				y: 47,
				w: 20,
				h: 13,
				content: 'scale',
				figure: {
					figure: 'spending.where_it_went',
					scope: mo,
					chart: 'donut',
					title: words('Where your income went'),
					caption: { context: label, text: 'income and spending split' }
				}
			},
			// Month by category: the focus month's row is its Total row, how much each category has taken
			// so far.
			heatmap: {
				x: 0,
				y: 60,
				w: 48,
				h: 19,
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
			}
		})
	);

	const entries = $derived(historyOf(data.months[monthKey]));
	// The same averages the categories chart draws, so the history's summary agrees with it.
	const averages = $derived.by(() => {
		const d = build(data, 'spending.vs_average', mo);
		return d.kind === 'deviation' ? Object.fromEntries(d.rows.map((r) => [r.label, r.base])) : {};
	});

	// Every outstanding row, not just this month's: a pending charge waits whichever month it was logged in.
	const pending = $derived(pendingRows(data));

	let modals: ReturnType<typeof EditModals>;
	let addDate = $state('');

	function add(iso = '') {
		addDate = iso;
		modals.add();
	}
	const addTitle = $derived(addDate ? `Add entry · ${dateShort(addDate)}` : 'Add entry');

	/** A row opens its month unfiltered; a cell also filters the history to its category. */
	function pickMonth(row: string, category: string | null) {
		const m = MONTHS.indexOf(row);
		if (m < 0) return;
		navigate({
			[MONTH_PARAM]: `${yearOf(monthKey)}-${String(m + 1).padStart(2, '0')}`,
			[P.day]: null,
			[P.type]: null,
			[P.category]: category,
			[P.account]: null,
			[P.search]: null
		});
	}

	function edit(e: HistoryEntry) {
		if (e.type === 'txn') modals.editTransaction(e.locator);
		else if (e.type === 'pay') modals.editPaycheck(e.locator);
		else modals.editTransfer(e.locator);
	}
</script>

<svelte:window onkeydown={(e) => isShortcut(e) && onKey(e, { n: () => add() })} />

<ViewHeader title="Transactions">
	<MonthNav
		value={monthKey}
		monthKeys={data.meta.month_keys}
		onchange={(k) => navigate({ [MONTH_PARAM]: k, [P.day]: null })}
	/>
</ViewHeader>

<Board key="transactions" layout={PANES} names={Object.keys(KPIS)} onreset={() => kpis.reset()}>
	<KpiCards {data} />

	<CalendarPanes
		{data}
		{monthKey}
		{day}
		onpick={(iso) => navigate({ [P.day]: iso })}
		onadd={add}
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

	<HistoryPane
		id="history"
		{entries}
		{filter}
		onfilter={setFilter}
		{averages}
		currency={data.currency}
		period={label}
		onedit={edit}
		onadd={() => add()}
	/>

	<FigurePane
		id="categories"
		{data}
		spec={PANES.categories.figure}
		picked={filter.category}
		onpick={(c) => setFilter({ category: filter.category === c ? null : c })}
	/>
	<FigurePane id="donut" {data} spec={PANES.donut.figure} />
	<FigurePane
		id="heatmap"
		{data}
		spec={PANES.heatmap.figure}
		picked={filter.category}
		onpick={pickMonth}
	/>
</Board>

<EditModals
	bind:this={modals}
	{accounts}
	{onsaved}
	kinds={['transaction', 'paycheck', 'transfer']}
	presetDate={addDate || undefined}
	{addTitle}
/>
