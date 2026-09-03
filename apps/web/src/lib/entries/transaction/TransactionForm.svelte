<script lang="ts">
	// Add / edit a transaction. Without `locator` it adds (POST /api/transaction); with one it
	// prefills from that entry and saves an update (POST /api/transaction/update) or deletes it.
	import { get } from 'svelte/store';
	import type { AccountsInfo } from '$lib/data/load';
	import { deleteTransaction, getJson, postJson } from '$lib/data/load';
	import { accountLeaf, formatAccount, money } from '$lib/utils/format';
	import { lastCategory, lastEntryDate, lastFundingAccount, seed } from '$lib/utils/editPrefs';
	import AccountField from '$lib/forms/fields/AccountField.svelte';
	import { problems, validateRows } from '$lib/forms/validate';
	import Credits, { type Credit } from '$lib/entries/transaction/Credits.svelte';
	import DatePicker from '$lib/forms/fields/DatePicker.svelte';
	import EntryFooter from '$lib/entries/EntryFooter.svelte';
	import FormSection from '$lib/forms/fields/FormSection.svelte';
	import AmountInput from '$lib/ui/AmountInput.svelte';

	const FUNDING_KINDS = [
		{ value: 'funding_credit', label: 'Credit card' },
		{ value: 'funding_cash', label: 'Cash / bank' }
	] as const;

	interface Props {
		accounts: AccountsInfo;
		/** When set, edit that entry; when absent, add a new transaction. */
		locator?: string;
		/** Add mode only: pre-fill the date field (e.g. the day clicked in the calendar). */
		presetDate?: string;
		/** Called after a successful save or delete (parent refreshes data + closes the modal). */
		onsaved: () => void;
	}
	let { accounts, locator, presetDate, onsaved }: Props = $props();

	const editing = $derived(locator != null);

	let date = $state('');
	let payee = $state('');
	let total = $state<number | null>(null);
	let category = $state('');
	let funding_account = $state('');
	let pending = $state(false);
	let credits = $state<Credit[]>([]);

	let msg = $state('');
	let err = $state(false);

	$effect(() => {
		if (locator == null) {
			// Add mode: seed the selects once the account lists are available (so a later-loading list
			// still populates them) without clobbering the user's pick. Category and funding both default
			// to the last one used, so a run of adds keeps the same picks (see editPrefs).
			if (!date && presetDate) date = presetDate;
			if (!category) category = seed(get(lastCategory), accounts.spending_categories);
			if (!funding_account)
				funding_account = seed(get(lastFundingAccount), accounts.funding_accounts);
			return;
		}
		// Edit mode: prefill from the ledger entry (its `amount` is the total bill).
		const l = locator;
		(async () => {
			const {
				ok,
				data: s,
				error
			} = await getJson<Record<string, any>>(`/api/transaction?locator=${encodeURIComponent(l)}`);
			if (!ok) {
				msg = error ?? 'load failed';
				err = true;
				return;
			}
			date = s.date ?? '';
			payee = s.payee ?? '';
			total = s.amount ?? null;
			category = s.category ?? '';
			funding_account = s.funding_account ?? '';
			pending = !!s.pending;
			credits = (s.credits ?? []).map((x: { account: string; amount: number }) => ({
				value: x.account,
				amount: x.amount
			}));
		})();
	});

	// Your share = total bill − everything reimbursed on the credits.
	const paybacks = $derived(credits.reduce((a, s) => a + (s.amount || 0), 0));
	const yourShare = $derived((total || 0) - paybacks);

	async function submit() {
		// A net share below zero is a valid net refund (reimbursements exceed the bill), not an error;
		// the summary flags it so an accidental over-credit is still visible.
		const problem = problems()
			.require(payee, 'Title')
			.positive(total, 'Total bill')
			.require(category, 'Category')
			.require(funding_account, 'Account')
			.add(validateRows(credits, 'reimbursement'))
			.message();
		if (problem) {
			msg = problem;
			err = true;
			return;
		}
		const body = {
			locator,
			date: date || undefined,
			payee: payee.trim(),
			amount: total,
			category,
			funding_account,
			pending,
			credits: credits
				.filter((s) => s.value && s.amount != null)
				.map((s) => ({ account: s.value, amount: s.amount as number }))
		};
		const { ok, error } = await postJson(
			editing ? '/api/transaction/update' : '/api/transaction',
			body
		);
		if (!ok) {
			msg = error ?? 'save failed';
			err = true;
			return;
		}
		if (!editing) {
			lastCategory.set(category);
			lastFundingAccount.set(funding_account);
			lastEntryDate.set(date);
		}
		onsaved();
	}

	async function del() {
		const problem = await deleteTransaction(locator!);
		if (problem) {
			msg = problem;
			err = true;
			return;
		}
		onsaved();
	}
</script>

<FormSection label="Details">
	<div class="field-grid">
		<div class="field">
			<label for="tx-date">Date</label>
			<DatePicker id="tx-date" ariaLabel="Date" bind:value={date} />
		</div>
		<div class="field">
			<label for="tx-payee">Title</label><input
				id="tx-payee"
				bind:value={payee}
				placeholder="e.g. lucky"
			/>
		</div>
		<div class="field">
			<label for="tx-amt">Total bill</label>
			<AmountInput id="tx-amt" bind:value={total} />
		</div>
	</div>
</FormSection>

<FormSection label="Categorize">
	<div class="field-grid">
		<AccountField
			id="tx-cat"
			label="Category"
			bind:value={category}
			options={accounts.spending_categories}
			kinds={[{ value: 'category', label: 'Category' }]}
			deriveValue={accountLeaf}
		/>
		<AccountField
			id="tx-fund"
			label="Account"
			bind:value={funding_account}
			options={accounts.funding_accounts}
			optionLabel={formatAccount}
			kinds={[...FUNDING_KINDS]}
		/>
		<label class="chk"><input type="checkbox" bind:checked={pending} /> Pending</label>
	</div>
</FormSection>

<FormSection label="Reimbursements">
	<Credits bind:credits creditAccounts={accounts.credit_accounts} />
</FormSection>

<EntryFooter
	{editing}
	bind:msg
	bind:err
	addLabel="+ Add"
	deleteLabel="Delete transaction"
	deleteQuestion="Delete this transaction?"
	onsubmit={submit}
	ondelete={del}
>
	{#snippet summary()}
		<span class="share">Your share: <b>{money(yourShare)}</b></span>
		{#if yourShare < 0}
			<span class="net-refund">Reimbursements exceed the bill — records a net refund.</span>
		{/if}
	{/snippet}
</EntryFooter>

<style>
	.chk {
		font-size: var(--text-secondary);
		color: var(--ink-2);
		display: flex;
		align-items: center;
		gap: var(--gap-inline);
		padding-bottom: var(--gap-row);
	}
	.share {
		color: var(--ink-2);
		font-size: var(--text-control);
	}
	.share b {
		color: var(--ink);
		font-size: var(--text-amount);
	}
	.net-refund {
		display: block;
		margin-top: var(--gap-inline);
		color: var(--warn);
		font-size: var(--text-caption);
	}
</style>
