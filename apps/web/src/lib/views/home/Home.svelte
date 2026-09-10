<script lang="ts">
	// Home — the logging hub. The month stepper is shared by the calendar and the balance snapshot.
	//
	// The layout below is only the DEFAULT; what the user rearranges is stored under this board's key.
	import type { DashboardData } from '$lib/data/types';
	import type { AccountsInfo } from '$lib/data/load';
	import type { BoardLayout } from '$lib/layout/grid/types';
	import { pendingRows } from '$lib/data/pending';
	import { latestMonthKey } from '$lib/data/scope';
	import { money, MONTHS } from '$lib/utils/format';
	import { matching, Pref } from '$lib/utils/persist.svelte';
	import ViewHeader from '$lib/layout/ViewHeader.svelte';
	import Board from '$lib/layout/grid/Board.svelte';
	import MonthNav from '$lib/nav/MonthNav.svelte';
	import BalanceChecklist from '$lib/balance/BalanceChecklist.svelte';
	import PendingPane from '$lib/lists/PendingPane.svelte';
	import CalendarPanes from '$lib/calendar/CalendarPanes.svelte';
	import EditModals from '$lib/entries/EditModals.svelte';

	interface Props {
		data: DashboardData;
		accounts: AccountsInfo | null;
		onsaved: () => void;
	}
	let { data, accounts, onsaved }: Props = $props();

	// The calendar is a CHART, not a list: it reserves its week rows, so it scales to whatever height
	// its pane has and its only minimum is a legibility floor.
	//
	// The day's entries and pending share the column beside it at a SET height, so each holds still
	// between a quiet day and a busy one and scrolls instead. Pending's top overlaps the day above it;
	// the push rule settles that, which is why the two read as a stack. Balances runs the full width
	// below and fits its content, since it is as long as your accounts are.
	const LAYOUT = {
		calendar: { x: 0, y: 0, w: 31, h: 25, content: 'scale' },
		day: { x: 31, y: 0, w: 17, h: 16, content: 'flow', mode: 'fixed' },
		pending: { x: 31, y: 15, w: 17, h: 9, content: 'flow', mode: 'fixed' },
		balances: { x: 0, y: 25, w: 48, h: 18, content: 'flow', mode: 'fit' }
	} satisfies BoardLayout;

	const pending = $derived(pendingRows(data));

	// Remembered under this view's OWN key: stepping the month while logging must not move what
	// Activity is reviewing.
	const month = new Pref('home-month', '', matching(/^\d{4}-\d{2}$/));
	// Seeded once, then left alone: the steppers may deliberately walk into empty months.
	$effect(() => {
		if (!month.value) month.value = latestMonthKey(data);
	});
	const monthKey = $derived(month.value);

	const md = $derived(data.months[monthKey]);
	// `good` marks the figures where a bigger number is good news, so they read in the positive accent.
	const totals = $derived([
		{ label: 'Spent', value: md?.total_spent ?? 0, good: false },
		{ label: 'Income', value: md?.total_income ?? 0, good: true },
		{ label: 'Saved', value: (md?.total_income ?? 0) - (md?.total_spent ?? 0), good: true }
	]);

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
	<dl class="totals push-end">
		{#each totals as t (t.label)}
			<div>
				<dt>{t.label}</dt>
				<dd class:pos={t.good && t.value > 0}>{money(t.value)}</dd>
			</div>
		{/each}
	</dl>
</ViewHeader>

<Board key="home" layout={LAYOUT}>
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
		caption="Fronted, waiting to be paid back"
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

<style>
	/* Wraps rather than squeezing, so a narrow header drops the strip to its own line intact. */
	.totals {
		display: flex;
		flex-wrap: wrap;
		margin: 0;
	}
	.totals > div {
		padding: 0 var(--gap-grid);
		border-left: 1px solid var(--border);
		text-align: right;
	}
	.totals > div:first-child {
		border-left: 0;
	}
	.totals dt {
		color: var(--ink-3);
		font-size: var(--text-label);
		text-transform: uppercase;
		letter-spacing: var(--ls-wide);
	}
	.totals dd {
		margin: var(--space-1) 0 0;
		font-family: var(--font-display);
		font-size: var(--text-panel);
		font-weight: var(--fw-semibold);
		font-variant-numeric: tabular-nums;
		letter-spacing: var(--ls-snug);
		line-height: var(--lh-tight);
	}
	.totals .pos {
		color: var(--good-text);
	}
	/* Once the strip wraps, a wrapped item's left border divides nothing and reads as a stray mark,
	   so below this width the gap does the separating. */
	@media (max-width: 34rem) {
		.totals {
			gap: var(--gap-row) var(--gap-grid);
		}
		.totals > div {
			border-left: 0;
			padding: 0;
			text-align: left;
		}
	}
</style>
