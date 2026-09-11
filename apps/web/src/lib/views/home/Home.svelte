<script lang="ts">
	// Home — the logging hub. The month stepper is shared by the calendar and the balance snapshot.
	//
	// The layout below is only the DEFAULT; what the user rearranges is stored under this board's key.
	import type { DashboardData } from '$lib/data/types';
	import type { AccountsInfo } from '$lib/data/load';
	import type { KpiBoardDefs } from '$lib/kpi/spec';
	import type { Scope } from '$lib/data/scope';
	import { pendingRows } from '$lib/data/pending';
	import { latestMonthKey } from '$lib/data/scope';
	import { MONTHS } from '$lib/utils/format';
	import { matching, Pref } from '$lib/utils/persist.svelte';
	import ViewHeader from '$lib/layout/ViewHeader.svelte';
	import Board from '$lib/layout/grid/Board.svelte';
	import { useKpiBoard } from '$lib/kpi/context';
	import KpiCards from '$lib/kpi/KpiCards.svelte';
	import MonthNav from '$lib/nav/MonthNav.svelte';
	import BalanceChecklist from '$lib/balance/BalanceChecklist.svelte';
	import PendingPane from '$lib/lists/PendingPane.svelte';
	import CalendarPanes from '$lib/calendar/CalendarPanes.svelte';
	import EditModals from '$lib/entries/EditModals.svelte';
	import { words } from '$lib/ui/label';

	interface Props {
		data: DashboardData;
		accounts: AccountsInfo | null;
		onsaved: () => void;
	}
	let { data, accounts, onsaved }: Props = $props();

	const pending = $derived(pendingRows(data));

	// Remembered under this view's OWN key: stepping the month while logging must not move what
	// Activity is reviewing.
	const month = new Pref('home-month', '', matching(/^\d{4}-\d{2}$/));
	// Seeded once, then left alone: the steppers may deliberately walk into empty months.
	$effect(() => {
		if (!month.value) month.value = latestMonthKey(data);
	});
	const monthKey = $derived(month.value);
	const mo = $derived<Scope>({ level: 'month', monthKey });

	// The month's three figures, each with how it moved against last month. No charts: this is the
	// logging hub, and the shape of the month is Activity's job. They open as one strip over the calendar.
	const KPIS = $derived<KpiBoardDefs>({
		income: { rect: { x: 0, y: 0, w: 10, h: 5 }, spec: { figure: 'change.income_mom', scope: mo } },
		spent: {
			rect: { x: 10, y: 0, w: 10, h: 5 },
			spec: { figure: 'change.spending_mom', scope: mo }
		},
		saved: { rect: { x: 20, y: 0, w: 11, h: 5 }, spec: { figure: 'change.saved_mom', scope: mo } }
	});

	const kpis = useKpiBoard('home', () => KPIS, [
		{ ids: ['income', 'spent', 'saved'], axis: 'row' }
	]);

	// The calendar is a CHART, not a list: it reserves its week rows, so it scales to its pane's height and
	// its only minimum is legibility. The day's entries and pending sit beside it at a SET height, so each
	// holds still between a quiet day and a busy one and scrolls instead. Balances fits its content, being
	// as long as your accounts are.
	const LAYOUT = $derived(
		kpis.board({
			calendar: { x: 0, y: 5, w: 31, h: 26, content: 'scale' },
			day: { x: 31, y: 10, w: 17, h: 21, content: 'flow', mode: 'fixed' },
			pending: { x: 31, y: 0, w: 17, h: 10, content: 'flow', mode: 'fixed' },
			balances: { x: 0, y: 31, w: 48, h: 18, content: 'flow', mode: 'fit' }
		})
	);

	let modals: ReturnType<typeof EditModals>;
	let addDate = $state('');

	function addOn(iso: string) {
		addDate = iso;
		modals.add();
	}

	const addTitle = $derived.by(() => {
		if (!addDate) return 'Add entry';
		const [, m, d] = addDate.split('-');
		return `Add entry · ${MONTHS[Number(m) - 1]} ${Number(d)}`;
	});
</script>

<ViewHeader title="Home">
	<MonthNav value={monthKey} monthKeys={data.meta.month_keys} onchange={(k) => (month.value = k)} />
</ViewHeader>

<Board key="home" layout={LAYOUT} names={Object.keys(KPIS)} onreset={() => kpis.reset()}>
	<KpiCards {data} />

	<CalendarPanes
		{data}
		{monthKey}
		onadd={addOn}
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
	<BalanceChecklist id="balances" {data} {accounts} {onsaved} {monthKey} />
</Board>

<EditModals
	bind:this={modals}
	{accounts}
	{onsaved}
	kinds={['transaction', 'paycheck', 'transfer']}
	presetDate={addDate || undefined}
	{addTitle}
/>
