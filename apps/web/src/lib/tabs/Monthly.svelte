<script lang="ts">
	import type { DashboardData } from '$lib/data/types';
	import type { AccountsInfo } from '$lib/data/load';
	import { money, monthLabel } from '$lib/utils/format';
	import { monthlyScalars } from '$lib/data/scalar';
	import { build } from '$lib/data/catalog';
	import Pane from '$lib/ui/Pane.svelte';
	import ViewHeader from '$lib/ui/ViewHeader.svelte';
	import KpiRow from '$lib/ui/KpiRow.svelte';
	import MonthNav from '$lib/ui/MonthNav.svelte';
	import Figure from '$lib/charts/Figure.svelte';
	import TransactionList from '$lib/ui/TransactionList.svelte';
	import PaycheckTable from '$lib/ui/PaycheckTable.svelte';
	import PendingList from '$lib/ui/PendingList.svelte';
	import EditModals from '$lib/forms/EditModals.svelte';

	interface Props {
		data: DashboardData;
		monthKey: string;
		edit: boolean;
		accounts: AccountsInfo | null;
		onsaved: () => void;
	}
	let { data, monthKey = $bindable(), edit, accounts, onsaved }: Props = $props();

	const md = $derived(data.months[monthKey]);

	const txns = $derived(
		md ? [...md.transactions].sort((a, b) => b.date.localeCompare(a.date)) : []
	);

	// Donut: where the month's income went — top categories, a rolled-up "Other", and a green
	// Saved slice. The catalog builds the primitive; the registry colours it.
	const donut = $derived(build(data, 'spending.where_it_went', { level: 'month', monthKey }));
	const noIncome = $derived(!!md && md.total_income <= 0);

	let modals: ReturnType<typeof EditModals>;
	let refreshKey = $state(0);

	// A save also refreshes the pending list (via refreshKey) on top of the page-level refresh.
	function onSaved() {
		refreshKey += 1;
		onsaved();
	}
</script>

<ViewHeader title="Monthly">
	<MonthNav value={monthKey} monthKeys={data.meta.month_keys} onchange={(k) => (monthKey = k)} />
</ViewHeader>

<KpiRow tiles={monthlyScalars(data, monthKey)} />

{#if edit && accounts}
	<div class="card editpanel">
		<div class="ephead">
			<h2 class="serif">Edit · {monthLabel(monthKey)}</h2>
			<div class="epactions">
				<button class="btn-ghost" onclick={() => modals.addTransaction()}>+ Add transaction</button>
				<button class="btn-ghost" onclick={() => modals.addPaycheck()}>+ Add paycheck</button>
			</div>
		</div>
		<PendingList {refreshKey} onedit={(l) => modals.editTransaction(l)} />
	</div>
{/if}

<div class="panes two">
	<Pane
		title="Where your income went"
		cap={md ? `${monthLabel(monthKey)} · net income ${money(md.total_income)}` : ''}
	>
		{#if noIncome}
			<p class="note">No income posted this month — showing spending only.</p>
		{/if}
		<Figure primitive={donut} chart="donut" />
	</Pane>
	<Pane
		title="Paychecks this month"
		cap={md ? `${md.paychecks.length} in ${monthLabel(monthKey)}` : ''}
	>
		{#if md && md.paychecks.length}
			<PaycheckTable paychecks={md.paychecks} {edit} onedit={(l) => modals.editPaycheck(l)} />
		{:else}
			<p class="note">No paychecks this month.</p>
		{/if}
	</Pane>
</div>

<div class="panes">
	<Pane
		title="Transaction history"
		cap={md ? `${md.transactions.length} transactions · ${monthLabel(monthKey)}` : ''}
	>
		{#if md}
			<TransactionList transactions={txns} {edit} onedit={(l) => modals.editTransaction(l)} />
		{/if}
	</Pane>
</div>

<EditModals bind:this={modals} {accounts} onsaved={onSaved} />

<style>
	.editpanel {
		margin-bottom: 18px;
		border-color: color-mix(in srgb, var(--lav) 30%, var(--border));
	}
	.ephead {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 12px;
		flex-wrap: wrap;
	}
	.ephead h2 {
		font-size: 15.5px;
		font-weight: 600;
		margin: 0;
	}
	.epactions {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	.note {
		color: var(--ink-3);
		font-size: 12.5px;
	}
</style>
