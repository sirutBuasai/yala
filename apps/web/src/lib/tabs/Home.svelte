<script lang="ts">
	// Home — the logging hub, and the only place editing happens. The calendar leads because it is
	// the weekly job; balances and the pending queue sit below it as the monthly and occasional
	// ones. Nothing here is time-scoped except the month stepper, which the calendar and the
	// balance snapshot share.
	import type { DashboardData } from '$lib/data/types';
	import type { AccountsInfo } from '$lib/data/load';
	import { pendingRows } from '$lib/data/pending';
	import { money } from '$lib/utils/format';
	import ViewHeader from '$lib/layout/ViewHeader.svelte';
	import MonthNav from '$lib/nav/MonthNav.svelte';
	import BalanceChecklist from '$lib/forms/balance/BalanceChecklist.svelte';
	import PendingPane from '$lib/lists/PendingPane.svelte';
	import CalendarBoard from '$lib/calendar/CalendarBoard.svelte';
	import EditModals from '$lib/forms/EditModals.svelte';

	interface Props {
		data: DashboardData;
		accounts: AccountsInfo | null;
		edit: boolean;
		onsaved: () => void;
	}
	let { data, accounts, edit, onsaved }: Props = $props();

	const pending = $derived(pendingRows(data));

	// One month scope shared by the calendar and the balance snapshot. Defaults to the latest month
	// with data; the header stepper drives it.
	const latest = $derived([...data.meta.month_keys].sort().at(-1) ?? '');
	let monthKey = $state('');
	$effect(() => {
		if (!monthKey && latest) monthKey = latest;
	});

	// The shown month's flow, so entering a week's spending gives immediate feedback without
	// leaving the page.
	const md = $derived(data.months[monthKey]);
	const totals = $derived([
		{ label: 'Spent', value: md?.total_spent ?? 0, good: false },
		{ label: 'Income', value: md?.total_income ?? 0, good: true },
		{ label: 'Saved', value: (md?.total_income ?? 0) - (md?.total_spent ?? 0), good: false }
	]);

	let modals: ReturnType<typeof EditModals>;
</script>

<ViewHeader title="Home">
	<MonthNav value={monthKey} monthKeys={data.meta.month_keys} onchange={(k) => (monthKey = k)} />
	<dl class="totals">
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
	/* Month flow, sitting on the header's baseline beside the stepper. */
	.totals {
		display: flex;
		margin: 0;
		margin-left: auto;
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
	@media (max-width: 52rem) {
		.totals {
			margin-left: 0;
		}
	}
</style>
