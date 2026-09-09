<script lang="ts">
	// Home — the logging hub. The calendar leads because it is the weekly job; the day's entries sit
	// beside it, and balances are the monthly job below. Nothing here is time-scoped except the month
	// stepper, which the calendar and the balance snapshot share.
	//
	// The arrangement below is only the DEFAULT. Every pane can be moved and resized, and what the
	// user settles on is stored under this board's own key — so this table says where things start,
	// not where they are.
	import type { DashboardData } from '$lib/data/types';
	import type { AccountsInfo } from '$lib/data/load';
	import type { Layout } from '$lib/layout/grid/types';
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

	// The calendar is a CHART, not a list: it reserves six week rows so a five-week month gets taller
	// cells rather than a blank sixth week, which is what keeps the page still as you page months. So
	// it scales to its pane, and its only minimum is a legibility floor — which is why 26 rows here is
	// close to the smallest it will accept.
	//
	// The day's entries take a SET height, matched to the calendar beside them, so the row keeps a line
	// and the pane holds still as you move between a quiet day and a busy one (it scrolls instead).
	// Balances simply fit: the list is as long as your accounts are. Pending is capped — it earns its
	// place on a clean month by hosting the add button, so it must not vanish, but nor should it
	// reserve a screenful for three rows.
	const LAYOUT = {
		calendar: { x: 0, y: 0, w: 29, h: 26, content: 'scale' },
		day: { x: 29, y: 0, w: 19, h: 26, content: 'flow', mode: 'fixed' },
		balances: { x: 0, y: 26, w: 30, h: 18, content: 'flow', mode: 'fit' },
		pending: { x: 30, y: 26, w: 18, h: 10, content: 'flow', mode: 'cap', cap: 10 }
	} satisfies Layout;

	const pending = $derived(pendingRows(data));

	// One month scope shared by the calendar and the balance snapshot, remembered under this view's
	// OWN key. Home is where you log and Activity is where you review, so stepping the month while
	// logging shouldn't move what Activity is showing — they're different jobs on different months.
	const month = new Pref('home-month', '', matching(/^\d{4}-\d{2}$/));
	// Seeded from the data the first time this view is ever used, then left alone: the steppers are
	// deliberately allowed to walk into empty months.
	$effect(() => {
		if (!month.value) month.value = latestMonthKey(data);
	});
	const monthKey = $derived(month.value);

	// The shown month's flow, so entering a week's spending gives immediate feedback without
	// leaving the page.
	const md = $derived(data.months[monthKey]);
	// `good` marks the figures where a positive number is good news, so they read in the positive
	// accent. Spent is the odd one out: a bigger number there is not an achievement.
	const totals = $derived([
		{ label: 'Spent', value: md?.total_spent ?? 0, good: false },
		{ label: 'Income', value: md?.total_income ?? 0, good: true },
		{ label: 'Saved', value: (md?.total_income ?? 0) - (md?.total_spent ?? 0), good: true }
	]);

	let modals: ReturnType<typeof EditModals>;
	/** The day an add was launched from, so the form opens on it. */
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
		cap="Fronted, waiting to be paid back"
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
	/* Month flow, sitting on the header's baseline beside the stepper. Wraps rather than squeezing,
	   so a narrow header drops it to its own line intact. */
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
	/* Once the strip wraps, the dividing rules stop dividing anything — a wrapped item keeps a left
	   border that now reads as a stray mark. Below this width the gap does the separating. */
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
