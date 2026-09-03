<script lang="ts">
	import type { DashboardData } from '$lib/data/types';
	import { addAccount, addInvestment, closeAccount, type AccountsInfo } from '$lib/data/load';
	import { formatAccount } from '$lib/utils/format';
	import { SaveState } from '$lib/forms/saveState.svelte';
	import { validateLeaf } from '$lib/forms/validate';
	import SaveFeedback from '$lib/forms/SaveFeedback.svelte';
	import ViewHeader from '$lib/layout/ViewHeader.svelte';
	import DeleteConfirm from '$lib/forms/fields/DeleteConfirm.svelte';
	import Select from '$lib/forms/fields/Select.svelte';
	import AccountRow from '$lib/manage/AccountRow.svelte';
	import InvestmentRow from '$lib/manage/InvestmentRow.svelte';
	import SettingsPanel from '$lib/manage/SettingsPanel.svelte';

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
	<span class="sub">Categories, accounts &amp; assumptions</span>
</ViewHeader>

{#if !edit}
	<p class="hint">
		Managing categories and accounts needs the local edit API. Start it with
		<code>make serve-api</code> and enable edit mode.
	</p>
{:else}
	<section class="panel">
		<h3>Planning assumptions</h3>
		<p class="hint">
			The few figures the ledger can't work out on its own. Everything else on the dashboard is
			derived from your entries. Saved into the ledger itself, dated — so revising one leaves the
			old value behind as history.
		</p>
		<SettingsPanel onsaved={() => onsaved?.()} />
	</section>

	<section class="panel">
		<h3>Add a spending category</h3>
		<div class="addrow">
			<input
				aria-label="new category name"
				bind:value={name}
				placeholder="e.g. Groceries"
				disabled={cat.busy}
				onkeydown={(e) => e.key === 'Enter' && add()}
			/>
			<button type="button" class="btn-accent" onclick={add} disabled={cat.busy}>Add</button>
		</div>
		<SaveFeedback save={cat} />
	</section>

	<section class="panel">
		<h3>Existing categories <span class="count">{categories.length}</span></h3>
		{#if categories.length}
			<ul class="cats">
				{#each categories as category (category)}
					<li>
						<span class="cat-name">{category}</span>
						<DeleteConfirm
							label="Close"
							confirmLabel="Yes, close"
							question={`Close ${category}?`}
							ondelete={() => close(category)}
							oncancel={() => cat.reset()}
						/>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="hint">No spending categories yet.</p>
		{/if}
	</section>

	<section class="panel">
		<h3>Add a bank account</h3>
		<div class="addrow">
			<input
				aria-label="new bank account name"
				bind:value={bankName}
				placeholder="e.g. Chase or Ally-Savings"
				disabled={bank.busy}
				onkeydown={(e) => e.key === 'Enter' && addBank()}
			/>
			<button type="button" class="btn-accent" onclick={addBank} disabled={bank.busy}>Add</button>
		</div>
		<p class="hint">Opens <code>Assets:Cash:&lt;name&gt;</code>.</p>
		<SaveFeedback save={bank} />
	</section>

	<section class="panel">
		<h3>Your bank accounts <span class="count">{banks.length}</span></h3>
		<p class="hint">
			Set a passthrough's sweep destination, or retire an account (drain its balance to another
			account, then close it).
		</p>
		{#if banks.length}
			<ul class="cats">
				{#each banks as account (account)}
					<AccountRow
						{account}
						{destinations}
						sweepDest={sweeps[account]}
						onchanged={() => onsaved?.()}
					/>
				{/each}
			</ul>
		{:else}
			<p class="hint">No bank accounts yet.</p>
		{/if}
	</section>

	<section class="panel">
		<h3>Add an investment account</h3>
		<div class="addrow">
			<div class="grow">
				<Select
					ariaLabel="investment subtree"
					bind:value={invSubtree}
					options={['Taxable', 'TaxAdvantaged']}
				/>
			</div>
			<input
				aria-label="investment name"
				bind:value={invName}
				placeholder="e.g. FidelityIndividual or HSA:Fidelity"
				disabled={inv.busy}
				onkeydown={(e) => e.key === 'Enter' && addInvest()}
			/>
			<button type="button" class="btn-accent" onclick={addInvest} disabled={inv.busy}>Add</button>
		</div>
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
		<p class="hint">Share accounts open unconstrained + seeded; a USD-only plan is tickerless.</p>
		<SaveFeedback save={inv} />
	</section>

	<section class="panel">
		<h3>Your investments <span class="count">{investments.length}</span></h3>
		<p class="hint">
			Retire an account to value its holdings in USD and split that total across destinations.
		</p>
		{#if investments.length}
			<ul class="cats">
				{#each investments as account (account)}
					<InvestmentRow
						{account}
						destinations={investDestinations}
						onchanged={() => onsaved?.()}
					/>
				{/each}
			</ul>
		{:else}
			<p class="hint">No investment accounts yet.</p>
		{/if}
	</section>
{/if}

<style>
	.sub {
		color: var(--ink-3);
		font-size: var(--text-subtitle);
	}
	.panel {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		padding: var(--space-8);
		box-shadow: var(--shadow);
		margin-bottom: var(--space-6);
		max-width: 34rem;
	}
	.panel h3 {
		margin: 0 0 var(--space-5);
		font-size: var(--text-control);
		font-weight: var(--fw-semibold);
		color: var(--ink);
	}
	.count {
		color: var(--ink-3);
		font-weight: var(--fw-medium);
	}
	.addrow {
		display: flex;
		gap: var(--gap-inline);
		align-items: center;
	}
	.grow {
		flex: 1;
		min-width: 0;
	}
	.chk {
		display: flex;
		align-items: center;
		gap: var(--gap-inline);
		margin-top: var(--gap-row);
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
	.hint {
		color: var(--ink-3);
		font-size: var(--text-subtitle);
	}
	.cats {
		display: flex;
		flex-direction: column;
		gap: var(--gap-row);
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.cats li {
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
	.cat-name {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
