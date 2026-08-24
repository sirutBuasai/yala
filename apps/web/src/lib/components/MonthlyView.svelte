<script lang="ts">
	import type { DashboardData } from '$lib/types';
	import type { AccountsInfo } from '$lib/data';
	import { money, monthLabel } from '$lib/format';
	import { monthlyKpis } from '$lib/kpis';
	import { categorySlices, type Slice } from '$lib/charts/slices';
	import Pane from './Pane.svelte';
	import ViewHeader from './ViewHeader.svelte';
	import KpiRow from './KpiRow.svelte';
	import MonthNav from './MonthNav.svelte';
	import Donut from './charts/Donut.svelte';
	import Overlay from './Overlay.svelte';
	import TransactionList from './TransactionList.svelte';
	import PaycheckTable from './PaycheckTable.svelte';
	import TransactionForm from './TransactionForm.svelte';
	import PaycheckForm from './PaycheckForm.svelte';
	import PendingList from './PendingList.svelte';

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

	const slices = $derived.by<Slice[]>(() => {
		if (!md) return [];
		const saved = md.total_income - md.total_spent;
		const savedShown = md.total_income > 0 && saved > 0;
		// Cap the donut at 10 total slices; the Saved slice counts, so leave room for it.
		const s = categorySlices(md.by_category, savedShown ? 9 : 10);
		if (savedShown) s.push({ name: 'Saved', value: saved, color: 'var(--saved)' });
		return s;
	});
	const noIncome = $derived(!!md && md.total_income <= 0);

	let showAdd = $state(false);
	let showPaycheck = $state(false);
	let editingLocator = $state<string | null>(null);
	let editingPaycheck = $state<string | null>(null);
	let refreshKey = $state(0);

	function afterSave() {
		showAdd = false;
		showPaycheck = false;
		editingLocator = null;
		editingPaycheck = null;
		refreshKey += 1;
		onsaved();
	}
</script>

<ViewHeader title="Monthly">
	<MonthNav value={monthKey} monthKeys={data.meta.month_keys} onchange={(k) => (monthKey = k)} />
</ViewHeader>

<KpiRow tiles={monthlyKpis(data, monthKey)} />

{#if edit && accounts}
	<div class="card editpanel">
		<div class="ephead">
			<h2 class="serif">Edit · {monthLabel(monthKey)}</h2>
			<div class="epactions">
				<button class="btn-ghost" onclick={() => (showAdd = true)}>+ Add transaction</button>
				<button class="btn-ghost" onclick={() => (showPaycheck = true)}>+ Add paycheck</button>
			</div>
		</div>
		<PendingList {refreshKey} onedit={(l) => (editingLocator = l)} />
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
		<Donut {slices} />
	</Pane>
	<Pane
		title="Paychecks this month"
		cap={md ? `${md.paychecks.length} in ${monthLabel(monthKey)}` : ''}
	>
		{#if md && md.paychecks.length}
			<PaycheckTable paychecks={md.paychecks} {edit} onedit={(l) => (editingPaycheck = l)} />
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
			<TransactionList transactions={txns} {edit} onedit={(l) => (editingLocator = l)} />
		{/if}
	</Pane>
</div>

{#if showAdd && accounts}
	<Overlay title="Add transaction" onclose={() => (showAdd = false)}>
		<TransactionForm {accounts} onsaved={afterSave} />
	</Overlay>
{/if}

{#if showPaycheck && accounts}
	<Overlay title="Add paycheck" onclose={() => (showPaycheck = false)}>
		<PaycheckForm {accounts} onsaved={afterSave} />
	</Overlay>
{/if}

{#if editingLocator && accounts}
	<Overlay title="Edit transaction" onclose={() => (editingLocator = null)}>
		<TransactionForm locator={editingLocator} {accounts} onsaved={afterSave} />
	</Overlay>
{/if}

{#if editingPaycheck && accounts}
	<Overlay title="Edit paycheck" onclose={() => (editingPaycheck = null)}>
		<PaycheckForm locator={editingPaycheck} {accounts} onsaved={afterSave} />
	</Overlay>
{/if}

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
