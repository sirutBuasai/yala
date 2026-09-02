<script lang="ts">
	// Home — the time-agnostic logging hub. Top to bottom: log this month's account balances,
	// the all-months pending queue, and the month calendar with its day-detail panel. Editing
	// lives here; the analysis tabs stay read-only.
	import type { DashboardData } from '$lib/data/types';
	import type { AccountsInfo } from '$lib/data/load';
	import { pendingRows } from '$lib/data/pending';
	import ViewHeader from '$lib/layout/ViewHeader.svelte';
	import MonthNav from '$lib/nav/MonthNav.svelte';
	import BalancePane from '$lib/forms/balance/BalancePane.svelte';
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

	// One month scope shared by the calendar and the balance snapshot. Defaults to the latest
	// month with data; the calendar's stepper drives it, and the balance pane logs into it.
	const latest = $derived([...data.meta.month_keys].sort().at(-1) ?? '');
	let monthKey = $state('');
	$effect(() => {
		if (!monthKey && latest) monthKey = latest;
	});

	let modals: ReturnType<typeof EditModals>;
</script>

<ViewHeader title="Home">
	<MonthNav value={monthKey} monthKeys={data.meta.month_keys} onchange={(k) => (monthKey = k)} />
</ViewHeader>

<section class="sec">
	<BalancePane {data} {accounts} {edit} {onsaved} {monthKey} />
</section>

<section class="sec">
	<PendingPane
		transactions={pending}
		{edit}
		onedit={(l) => modals.editTransaction(l)}
		caption="Fronted entries across all months — tap one to reconcile"
	/>
</section>

<section class="sec">
	<CalendarBoard {data} {edit} {accounts} {onsaved} {monthKey} />
</section>

<EditModals bind:this={modals} {accounts} {onsaved} />

<style>
	.sec {
		margin-bottom: var(--space-11);
	}
</style>
