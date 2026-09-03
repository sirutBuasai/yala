<script lang="ts">
	import type { DashboardData } from '$lib/data/types';
	import { addAccount, addInvestment, closeAccount, type AccountsInfo } from '$lib/data/load';
	import { formatAccount } from '$lib/utils/format';
	import { SaveState } from '$lib/forms/saveState.svelte';
	import { validateLeaf } from '$lib/forms/validate';
	import SaveFeedback from '$lib/forms/SaveFeedback.svelte';
	import ViewHeader from '$lib/layout/ViewHeader.svelte';
	import DeleteConfirm from '$lib/ui/DeleteConfirm.svelte';
	import Select from '$lib/forms/fields/Select.svelte';
	import AccountRow from '$lib/views/manage/AccountRow.svelte';
	import InvestmentRow from '$lib/views/manage/InvestmentRow.svelte';
	import SettingsPanel from '$lib/views/manage/SettingsPanel.svelte';
	import AddRow from '$lib/ui/AddRow.svelte';
	import ItemList from '$lib/ui/ItemList.svelte';
	import Panel from '$lib/ui/Panel.svelte';

	interface Props {
		data: DashboardData;
		accounts: AccountsInfo | null;
		edit: boolean;
		/** Called after a change that alters ledger data (drain-close), to refresh the dashboard. */
		onsaved?: () => void;
	}
	let { accounts, edit, onsaved }: Props = $props();

	const categories = $derived(accounts?.spending_categories ?? []);
	const banks = $derived(accounts?.cash_accounts ?? []);
	// The full money set is the candidate pool for sweep and drain destinations.
	const destinations = $derived(accounts?.credit_accounts ?? []);
	const sweeps = $derived(accounts?.sweeps ?? {});

	// --- spending categories ---
	let name = $state('');
	const cat = new SaveState();

	async function add() {
		const leaf = name.trim();
		const problem =
			validateLeaf(leaf, 'category name') ??
			(categories.includes(leaf) ? `${leaf} already exists.` : null);
		if (problem) return cat.fail(problem);

		if (await cat.run(() => addAccount('category', leaf).then((r) => r.error), `Added ${leaf}.`)) {
			name = '';
		}
	}

	const close = (category: string) =>
		cat.run(() => closeAccount(`Expenses:${category}`), `Closed ${category}.`);

	// --- bank accounts ---
	let bankName = $state('');
	const bank = new SaveState();

	async function addBank() {
		const leaf = bankName.trim();
		const problem = validateLeaf(leaf, 'bank account name');
		if (problem) return bank.fail(problem);

		let opened = leaf;
		const ok = await bank.run(async () => {
			const { account, error } = await addAccount('funding_cash', leaf);
			if (account) opened = formatAccount(account);
			return error;
		});
		if (ok) {
			bank.note = `Added ${opened}.`;
			bankName = '';
		}
	}

	// --- investment accounts ---
	const investments = $derived(accounts?.investment_accounts ?? []);
	// Retire to any money account or another investment.
	const investDestinations = $derived([...(accounts?.credit_accounts ?? []), ...investments]);

	let invSubtree = $state('Taxable');
	let invName = $state('');
	let invShares = $state(true);
	let invContributable = $state(false);
	let invEmployer = $state('');
	let invLabels = $state('');
	const inv = new SaveState();

	const splitCsv = (s: string) =>
		s
			.split(',')
			.map((x) => x.trim())
			.filter(Boolean);

	async function addInvest() {
		const leaf = invName.trim();
		if (!leaf) return inv.fail('Enter an account name.');

		const ok = await inv.run(
			() =>
				addInvestment({
					subtree: invSubtree as 'Taxable' | 'TaxAdvantaged',
					name: leaf,
					holds_shares: invShares,
					employer: invContributable && invEmployer.trim() ? invEmployer.trim() : null,
					labels: invContributable ? splitCsv(invLabels) : []
				}),
			`Added ${invSubtree}:${leaf}.`
		);
		if (ok) invName = '';
	}
</script>

<ViewHeader title="Manage">
	<span class="cap">Categories, accounts &amp; assumptions</span>
</ViewHeader>

{#if !edit}
	<p class="cap">
		Managing categories and accounts needs the local edit API. Start it with
		<code>make serve-api</code> and enable edit mode.
	</p>
{:else}
	<Panel
		title="Planning assumptions"
		cap="The few figures the ledger can't work out on its own. Everything else on the dashboard is derived from your entries. Saved into the ledger itself, dated — so revising one leaves the old value behind as history."
	>
		<SettingsPanel onsaved={() => onsaved?.()} />
	</Panel>

	<Panel title="Add a spending category">
		<AddRow
			bind:value={name}
			ariaLabel="new category name"
			placeholder="e.g. Groceries"
			disabled={cat.busy}
			onadd={add}
		/>
		<SaveFeedback save={cat} />
	</Panel>

	<Panel title="Existing categories" count={categories.length}>
		<ItemList any={categories.length > 0} empty="No spending categories yet.">
			{#each categories as category (category)}
				<li class="simple">
					<span class="name">{category}</span>
					<DeleteConfirm
						label="Close"
						confirmLabel="Yes, close"
						question={`Close ${category}?`}
						ondelete={() => close(category)}
						oncancel={() => cat.reset()}
					/>
				</li>
			{/each}
		</ItemList>
	</Panel>

	<Panel title="Add a bank account" cap="Opens Assets:Cash:<name>.">
		<AddRow
			bind:value={bankName}
			ariaLabel="new bank account name"
			placeholder="e.g. Chase or Ally-Savings"
			disabled={bank.busy}
			onadd={addBank}
		/>
		<SaveFeedback save={bank} />
	</Panel>

	<Panel
		title="Your bank accounts"
		count={banks.length}
		cap="Set a passthrough's sweep destination, or retire an account (drain its balance to another account, then close it)."
	>
		<ItemList any={banks.length > 0} empty="No bank accounts yet.">
			{#each banks as account (account)}
				<AccountRow
					{account}
					{destinations}
					sweepDest={sweeps[account]}
					onchanged={() => onsaved?.()}
				/>
			{/each}
		</ItemList>
	</Panel>

	<Panel
		title="Add an investment account"
		cap="Share accounts open unconstrained + seeded; a USD-only plan is tickerless."
	>
		<AddRow
			bind:value={invName}
			ariaLabel="investment name"
			placeholder="e.g. FidelityIndividual or HSA:Fidelity"
			disabled={inv.busy}
			onadd={addInvest}
		>
			{#snippet before()}
				<Select
					ariaLabel="investment subtree"
					bind:value={invSubtree}
					options={['Taxable', 'TaxAdvantaged']}
				/>
			{/snippet}
		</AddRow>
		<label class="chk"
			><input type="checkbox" bind:checked={invShares} /> Holds tickers (shares)</label
		>
		<label class="chk">
			<input type="checkbox" bind:checked={invContributable} /> Payroll-contributable
		</label>
		{#if invContributable}
			<input aria-label="employer" bind:value={invEmployer} placeholder="employer (e.g. Amazon)" />
			<input
				aria-label="labels"
				bind:value={invLabels}
				placeholder="contribution options, comma-separated (e.g. Roth401k,Trad401k,AfterTax401k)"
			/>
		{/if}
		<SaveFeedback save={inv} />
	</Panel>

	<Panel
		title="Your investments"
		count={investments.length}
		cap="Retire an account to value its holdings in USD and split that total across destinations."
	>
		<ItemList any={investments.length > 0} empty="No investment accounts yet.">
			{#each investments as account (account)}
				<InvestmentRow {account} destinations={investDestinations} onchanged={() => onsaved?.()} />
			{/each}
		</ItemList>
	</Panel>
{/if}

<style>
	/* A plain, non-expanding managed item — a category has nothing to configure, only to close. */
	.simple {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--gap-inline);
		background: var(--inset);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		padding: var(--space-3) var(--space-5);
		font-size: var(--text-control);
		color: var(--ink-2);
	}
	.simple .name {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.chk {
		display: flex;
		align-items: center;
		gap: var(--gap-inline);
		font-size: var(--text-control);
		color: var(--ink-2);
	}
	.chk input {
		flex: 0 0 auto;
	}
	input {
		flex: 1;
		min-width: 0;
		background-color: var(--inset);
		border: 1px solid var(--border);
		color: var(--ink);
		border-radius: var(--radius-md);
		padding: var(--pad-control);
		font-size: var(--text-control);
		font-family: inherit;
	}
</style>
