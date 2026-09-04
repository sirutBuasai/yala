<script lang="ts">
	import type { DashboardData } from '$lib/data/types';
	import { addAccount, addInvestment, closeAccount, type AccountsInfo } from '$lib/data/load';
	import { formatAccount } from '$lib/utils/format';
	import { accountVar } from '$lib/utils/theme';
	import { SaveState } from '$lib/forms/saveState.svelte';
	import { LEAF_MAX, problems, validateLeaf } from '$lib/forms/validate';
	import SaveFeedback from '$lib/forms/SaveFeedback.svelte';
	import ViewHeader from '$lib/layout/ViewHeader.svelte';
	import DeleteConfirm from '$lib/ui/DeleteConfirm.svelte';
	import Select from '$lib/forms/fields/Select.svelte';
	import AccountRow from '$lib/views/manage/AccountRow.svelte';
	import AddAccountPanel from '$lib/views/manage/AddAccountPanel.svelte';
	import InvestmentRow from '$lib/views/manage/InvestmentRow.svelte';
	import SettingsPanel from '$lib/views/manage/SettingsPanel.svelte';
	import AddRow from '$lib/ui/AddRow.svelte';
	import ItemList from '$lib/ui/ItemList.svelte';
	import Panel from '$lib/ui/Panel.svelte';

	/** Ledger prefix for credit cards, to pick them out of the mixed payback-source list. */
	const LIABILITY = 'Liabilities:';

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

	// --- money accounts (banks and cards) ---
	// AddAccountPanel owns the fields, the busy state and the confirmation; each panel only says which
	// ledger prefix it opens under. `credit_accounts` mixes cash and cards (it is the payback-source
	// pool), so the card list filters it rather than being a list of its own.
	const cards = $derived((accounts?.credit_accounts ?? []).filter((a) => a.startsWith(LIABILITY)));

	// --- investment accounts ---
	const investments = $derived(accounts?.investment_accounts ?? []);
	// Retire to any money account or another investment.
	const investDestinations = $derived([...(accounts?.credit_accounts ?? []), ...investments]);

	let invSubtree = $state('Taxable');
	let invShares = $state(true);
	let invContributable = $state(false);
	let invEmployer = $state('');
	let invLabels = $state('');

	const splitCsv = (s: string) =>
		s
			.split(',')
			.map((x) => x.trim())
			.filter(Boolean);

	/**
	 * The payroll half of an investment: an employer and the contribution options it offers. Both are
	 * written into the ledger as account metadata, so they follow the leaf rule — and a
	 * payroll-contributable account with neither would offer nothing to contribute to.
	 */
	function validatePayrollFields(): string | null {
		if (!invContributable) return null;

		const labels = splitCsv(invLabels);
		const checks = problems()
			.add(validateLeaf(invEmployer.trim(), 'employer'))
			.add(labels.length ? null : 'List at least one contribution option.');
		for (const label of labels) checks.add(validateLeaf(label, 'contribution option'));

		return checks.message() || null;
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

	<AddAccountPanel
		title="Add a bank account"
		cap="Named by institution alone — a second account at the same bank is when a product name starts to earn its place."
		withAccountName={false}
		open={(naming) => addAccount('funding_cash', naming)}
	/>

	<AddAccountPanel
		title="Add a credit card"
		cap="Issuer plus the card's own name, both spelled out — the ledger keeps the full name and the short forms only stand in when a row can't fit it."
		accountNamePlaceholder="e.g. Cash Rewards"
		accountNameLabel="Card name"
		open={(naming) => addAccount('funding_credit', naming)}
	/>

	<Panel title="Your credit cards" count={cards.length}>
		<ItemList any={cards.length > 0} empty="No credit cards yet.">
			{#each cards as account (account)}
				<li class="row">
					<i class="dot" style:background={accountVar(account)}></i>
					<span>{formatAccount(account)}</span>
				</li>
			{/each}
		</ItemList>
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

	<AddAccountPanel
		title="Add an investment account"
		cap="Share accounts open unconstrained + seeded; a USD-only plan is tickerless."
		institutionPlaceholder="e.g. Example Brokerage"
		accountNamePlaceholder="e.g. Roth IRA"
		accountAliasPlaceholder="short account name (e.g. Roth)"
		validateExtra={validatePayrollFields}
		open={(naming) =>
			addInvestment({
				...naming,
				subtree: invSubtree as 'Taxable' | 'TaxAdvantaged',
				holds_shares: invShares,
				employer: invContributable && invEmployer.trim() ? invEmployer.trim() : null,
				labels: invContributable ? splitCsv(invLabels) : []
			})}
	>
		{#snippet extra()}
			<div class="subtree">
				<Select
					ariaLabel="investment subtree"
					bind:value={invSubtree}
					options={['Taxable', 'TaxAdvantaged']}
				/>
			</div>
			<label class="chk"
				><input type="checkbox" bind:checked={invShares} /> Holds tickers (shares)</label
			>
			<label class="chk">
				<input type="checkbox" bind:checked={invContributable} /> Payroll-contributable
			</label>
			{#if invContributable}
				<input
					aria-label="employer"
					bind:value={invEmployer}
					placeholder="employer (e.g. Employer1)"
					maxlength={LEAF_MAX}
				/>
				<input
					aria-label="labels"
					bind:value={invLabels}
					placeholder="contribution options, comma-separated (e.g. Roth401k,Trad401k,AfterTax401k)"
				/>
			{/if}
		{/snippet}
	</AddAccountPanel>

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
	.subtree {
		max-width: 14rem;
		margin-bottom: var(--gap-row);
	}
	/* A read-only listed card: there is nothing to configure on one yet, only to see its colour. */
	.row {
		display: flex;
		align-items: center;
		gap: var(--gap-inline);
		background: var(--inset);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		padding: var(--space-3) var(--space-5);
		font-size: var(--text-control);
		color: var(--ink-2);
	}
	.row .dot {
		width: 10px;
		height: 10px;
		border-radius: var(--radius-pill);
		flex: 0 0 auto;
	}
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
