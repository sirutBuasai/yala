<script lang="ts">
	// Home — the logging hub, and the only place editing happens. The calendar leads because it is
	// the weekly job; balances and the pending queue sit below it as the monthly and occasional
	// ones. Nothing here is time-scoped except the month stepper, which the calendar and the
	// balance snapshot share.
	import type { DashboardData } from '$lib/data/types';
	import type { AccountsInfo } from '$lib/data/load';
	import { pendingRows } from '$lib/data/pending';
	import { latestMonthKey } from '$lib/data/scope';
	import { money } from '$lib/utils/format';
	import { matching, Pref } from '$lib/utils/persist.svelte';
	import ViewHeader from '$lib/layout/ViewHeader.svelte';
	import MonthNav from '$lib/nav/MonthNav.svelte';
	import BalanceChecklist from '$lib/balance/BalanceChecklist.svelte';
	import PendingPane from '$lib/lists/PendingPane.svelte';
	import CalendarBoard from '$lib/calendar/CalendarBoard.svelte';
	import EditModals from '$lib/entries/EditModals.svelte';

	interface Props {
		data: DashboardData;
		accounts: AccountsInfo | null;
		edit: boolean;
		onsaved: () => void;
	}
	let { data, accounts, edit, onsaved }: Props = $props();

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

<div class="sec">
	<CalendarBoard {data} {edit} {accounts} {onsaved} {monthKey}>
		{#snippet railBelow()}
			<PendingPane
				transactions={pending}
				{edit}
				onedit={(l) => modals.editTransaction(l)}
				fixedRows={3}
				prefKey="home-pending"
			/>
		{/snippet}
	</CalendarBoard>
</div>

<BalanceChecklist {data} {accounts} {edit} {onsaved} {monthKey} />

<EditModals bind:this={modals} {accounts} {onsaved} />

<style>
	.sec {
		margin-bottom: var(--gap-grid);
	}
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
