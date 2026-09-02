<script lang="ts">
	import type { DashboardData } from '$lib/data/types';
	import { addAccount, addInvestment, closeAccount, type AccountsInfo } from '$lib/data/load';
	import { formatAccount } from '$lib/utils/format';
	import ViewHeader from '$lib/layout/ViewHeader.svelte';
	import DeleteConfirm from '$lib/forms/fields/DeleteConfirm.svelte';
	import Select from '$lib/forms/fields/Select.svelte';
	import AccountRow from '$lib/manage/AccountRow.svelte';
	import InvestmentRow from '$lib/manage/InvestmentRow.svelte';

	interface Props {
		data: DashboardData;
		accounts: AccountsInfo | null;
		edit: boolean;
		/** Called after a change that alters ledger data (drain-close), to refresh the dashboard. */
		onsaved?: () => void;
	}
	let { accounts, edit, onsaved }: Props = $props();

	// A new account name is a single leaf (mirrors the backend's _LEAF_RE).
	const LEAF_RE = /^[A-Za-z0-9-]+$/;

	const categories = $derived(accounts?.spending_categories ?? []);
	const banks = $derived(accounts?.cash_accounts ?? []);
	// The full money set is the candidate pool for sweep and drain destinations.
	const destinations = $derived(accounts?.credit_accounts ?? []);
	const sweeps = $derived(accounts?.sweeps ?? {});

	let name = $state('');
	let err = $state('');
	let note = $state('');
	let busy = $state(false);

	async function add() {
		const leaf = name.trim();
		note = '';
		if (!leaf) {
			err = 'Enter a category name.';
			return;
		}
		if (!LEAF_RE.test(leaf)) {
			err = 'Use only letters, numbers, or hyphens.';
			return;
		}
		if (categories.includes(leaf)) {
			err = `${leaf} already exists.`;
			return;
		}
		busy = true;
		err = '';
		const { account, error } = await addAccount('category', leaf);
		if (account) {
			note = `Added ${leaf}.`;
			name = '';
		} else {
			err = error ?? 'Add failed.';
		}
		busy = false;
	}

	async function close(cat: string) {
		note = '';
		err = '';
		const error = await closeAccount(`Expenses:${cat}`);
		if (error) err = error;
		else note = `Closed ${cat}.`;
	}

	// --- bank accounts ---
	let bankName = $state('');
	let bankErr = $state('');
	let bankNote = $state('');
	let bankBusy = $state(false);

	async function addBank() {
		const leaf = bankName.trim();
		bankNote = '';
		if (!leaf) {
			bankErr = 'Enter a bank account name.';
			return;
		}
		if (!LEAF_RE.test(leaf)) {
			bankErr = 'Use only letters, numbers, or hyphens.';
			return;
		}
		bankBusy = true;
		bankErr = '';
		const { account, error } = await addAccount('funding_cash', leaf);
		if (account) {
			bankNote = `Added ${formatAccount(account)}.`;
			bankName = '';
		} else {
			bankErr = error ?? 'Add failed.';
		}
		bankBusy = false;
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
	let invErr = $state('');
	let invNote = $state('');
	let invBusy = $state(false);

	const splitCsv = (s: string) =>
		s
			.split(',')
			.map((x) => x.trim())
			.filter(Boolean);

	async function addInvest() {
		const name = invName.trim();
		invNote = '';
		if (!name) {
			invErr = 'Enter an account name.';
			return;
		}
		invBusy = true;
		invErr = '';
		const error = await addInvestment({
			subtree: invSubtree as 'Taxable' | 'TaxAdvantaged',
			name,
			holds_shares: invShares,
			employer: invContributable && invEmployer.trim() ? invEmployer.trim() : null,
			labels: invContributable ? splitCsv(invLabels) : []
		});
		invBusy = false;
		if (error) invErr = error;
		else {
			invNote = `Added ${invSubtree}:${name}.`;
			invName = '';
		}
	}
</script>

<ViewHeader title="Manage">
	<span class="sub">Categories &amp; accounts</span>
</ViewHeader>

{#if !edit}
	<p class="hint">
		Managing categories and accounts needs the local edit API. Start it with
		<code>make serve-api</code> and enable edit mode.
	</p>
{:else}
	<section class="panel">
		<h3>Add a spending category</h3>
		<div class="addrow">
			<input
				aria-label="new category name"
				bind:value={name}
				placeholder="e.g. Groceries"
				disabled={busy}
				onkeydown={(e) => e.key === 'Enter' && add()}
			/>
			<button type="button" class="btn-accent" onclick={add} disabled={busy}>Add</button>
		</div>
		{#if err}<span class="err" role="alert">{err}</span>{/if}
		{#if note}<span class="note" role="status">{note}</span>{/if}
	</section>

	<section class="panel">
		<h3>Existing categories <span class="count">{categories.length}</span></h3>
		{#if categories.length}
			<ul class="cats">
				{#each categories as cat (cat)}
					<li>
						<span class="cat-name">{cat}</span>
						<DeleteConfirm
							label="Close"
							confirmLabel="Yes, close"
							question={`Close ${cat}?`}
							ondelete={() => close(cat)}
							oncancel={() => (err = '')}
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
				disabled={bankBusy}
				onkeydown={(e) => e.key === 'Enter' && addBank()}
			/>
			<button type="button" class="btn-accent" onclick={addBank} disabled={bankBusy}>Add</button>
		</div>
		<p class="hint">Opens <code>Assets:Cash:&lt;name&gt;</code>.</p>
		{#if bankErr}<span class="err" role="alert">{bankErr}</span>{/if}
		{#if bankNote}<span class="note" role="status">{bankNote}</span>{/if}
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
				disabled={invBusy}
				onkeydown={(e) => e.key === 'Enter' && addInvest()}
			/>
			<button type="button" class="btn-accent" onclick={addInvest} disabled={invBusy}>Add</button>
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
		{#if invErr}<span class="err" role="alert">{invErr}</span>{/if}
		{#if invNote}<span class="note" role="status">{invNote}</span>{/if}
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
	.err,
	.note {
		display: block;
		margin-top: var(--space-4);
		font-size: var(--text-caption);
	}
	.err {
		color: var(--crit-text);
	}
	.note {
		color: var(--ink-3);
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
