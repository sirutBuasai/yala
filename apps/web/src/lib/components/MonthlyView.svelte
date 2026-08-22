<script lang="ts">
	import type { DashboardData } from '$lib/types';
	import type { AccountsInfo } from '$lib/data';
	import { money, monthLabel } from '$lib/format';
	import { monthlyKpis } from '$lib/kpis';
	import { categorySlices, type Slice } from '$lib/charts/slices';
	import Kpi from './Kpi.svelte';
	import Pane from './Pane.svelte';
	import Donut from './charts/Donut.svelte';
	import Modal from './Modal.svelte';
	import TransactionList from './TransactionList.svelte';
	import PaycheckTable from './PaycheckTable.svelte';
	import AddTransaction from './AddTransaction.svelte';
	import AddPaycheck from './AddPaycheck.svelte';
	import PendingList from './PendingList.svelte';
	import ReconcileEditor from './ReconcileEditor.svelte';
	import ReconcilePaycheck from './ReconcilePaycheck.svelte';
	import Select from './Select.svelte';

	interface Props {
		data: DashboardData;
		monthKey: string;
		edit: boolean;
		accounts: AccountsInfo | null;
		onsaved: () => void;
	}
	let { data, monthKey = $bindable(), edit, accounts, onsaved }: Props = $props();

	const months = $derived([...data.meta.month_keys].sort().reverse());
	const md = $derived(data.months[monthKey]);

	const txns = $derived(
		md ? [...md.transactions].sort((a, b) => b.date.localeCompare(a.date)) : []
	);

	// Donut: where the month's income went — top categories, a rolled-up "Other", and a green Saved slice.
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

	// --- edit drawers ---
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

<div class="mhead">
	<h2 class="serif">Monthly</h2>
	<div class="monthsel">
		<Select ariaLabel="Month" bind:value={monthKey} options={months} optionLabel={monthLabel} />
	</div>
</div>

<div class="kpis">
	{#each monthlyKpis(data, monthKey) as t (t.label)}
		<Kpi label={t.label} value={t.value} delta={t.delta} dir={t.dir} foot={t.foot} />
	{/each}
</div>

{#if edit && accounts}
	<div class="card editpanel">
		<div class="ephead">
			<h2 class="serif">Edit · {monthLabel(monthKey)}</h2>
			<div class="epactions">
				<button class="ghost" onclick={() => (showAdd = true)}>+ Add transaction</button>
				<button class="ghost" onclick={() => (showPaycheck = true)}>+ Add paycheck</button>
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
	<Modal title="Add transaction" onclose={() => (showAdd = false)}>
		<AddTransaction {accounts} onsaved={afterSave} />
	</Modal>
{/if}

{#if showPaycheck && accounts}
	<Modal title="Add paycheck" onclose={() => (showPaycheck = false)}>
		<AddPaycheck {accounts} onsaved={afterSave} />
	</Modal>
{/if}

{#if editingLocator && accounts}
	<Modal title="Edit transaction" onclose={() => (editingLocator = null)}>
		<ReconcileEditor locator={editingLocator} {accounts} onsaved={afterSave} />
	</Modal>
{/if}

{#if editingPaycheck && accounts}
	<Modal title="Edit paycheck" onclose={() => (editingPaycheck = null)}>
		<ReconcilePaycheck locator={editingPaycheck} {accounts} onsaved={afterSave} />
	</Modal>
{/if}

<style>
	.mhead {
		display: flex;
		align-items: center;
		gap: 14px;
		margin-bottom: 16px;
		flex-wrap: wrap;
	}
	.mhead h2 {
		font-size: 22px;
		font-weight: 600;
		margin: 0;
	}
	.monthsel {
		width: 160px;
	}
	.kpis {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 14px;
		margin-bottom: 18px;
	}
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
	.ghost {
		background: var(--inset);
		border: 1px solid var(--border);
		color: var(--ink-2);
		border-radius: 9px;
		padding: 7px 14px;
		font-size: 12.5px;
		cursor: pointer;
	}
	.ghost:hover {
		border-color: var(--lav);
		color: var(--ink);
	}
	.panes {
		display: grid;
		gap: 14px;
		margin-bottom: 14px;
	}
	.panes.two {
		grid-template-columns: 1fr 1fr;
		align-items: stretch; /* paired panes share the taller one's height */
	}
	.note {
		color: var(--ink-3);
		font-size: 12.5px;
	}
	@media (max-width: 900px) {
		.kpis {
			grid-template-columns: repeat(2, 1fr);
		}
		.panes.two {
			grid-template-columns: 1fr;
		}
	}
</style>
