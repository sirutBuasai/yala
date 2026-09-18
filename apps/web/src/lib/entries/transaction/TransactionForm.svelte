<script lang="ts">
	// Add / edit a transaction. Without `locator` it adds; with one it prefills from that entry and
	// saves an update or deletes it.
	import { get } from 'svelte/store';
	import { EntryForm, type EntryFormProps } from '$lib/entries/entryForm.svelte';
	import { formatAccount, money } from '$lib/utils/format';
	import { lastCategory, lastEntryDate, lastFundingAccount, seed } from '$lib/utils/editPrefs';
	import { problems, TEXT_MAX, validateRows } from '$lib/forms/validate';
	import Credits, { type Credit } from '$lib/entries/transaction/Credits.svelte';
	import DatePicker from '$lib/forms/fields/DatePicker.svelte';
	import EntryFooter from '$lib/entries/EntryFooter.svelte';
	import FormSection from '$lib/forms/fields/FormSection.svelte';
	import Select from '$lib/forms/fields/Select.svelte';
	import AmountInput from '$lib/ui/AmountInput.svelte';

	let { accounts, locator, presetDate, onsaved }: EntryFormProps = $props();

	const editing = $derived(locator != null);

	let date = $state('');
	let payee = $state('');
	let total = $state<number | null>(null);
	let category = $state('');
	let funding_account = $state('');
	let pending = $state(false);
	let credits = $state<Credit[]>([]);

	const form = new EntryForm('transaction', () => onsaved());

	$effect(() => {
		if (locator == null) {
			// Add mode: seed from the last entry's picks once the account lists load, without clobbering
			// anything already chosen (see editPrefs).
			if (!date && presetDate) date = presetDate;
			if (!category) category = seed(get(lastCategory), accounts.spending_categories);
			if (!funding_account)
				funding_account = seed(get(lastFundingAccount), accounts.funding_accounts);
			return;
		}
		// The entry's `amount` is the total bill.
		void form.load(locator, (s) => {
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
		});
	});

	// Your share = total bill − everything reimbursed on the credits.
	const paybacks = $derived(credits.reduce((a, s) => a + (s.amount || 0), 0));
	const yourShare = $derived((total || 0) - paybacks);

	function submit() {
		// A net share below zero is a valid net refund, not an error; the summary flags it anyway.
		const problem = problems()
			.require(payee, 'Title')
			.positive(total, 'Total bill')
			.require(category, 'Category')
			.require(funding_account, 'Account')
			.add(validateRows(credits, 'reimbursement'))
			.message();
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
		void form.save(problem, body, () => {
			lastCategory.set(category);
			lastFundingAccount.set(funding_account);
			lastEntryDate.set(date);
		});
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
				placeholder="e.g. Coffee"
				maxlength={TEXT_MAX}
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
		<div class="field">
			<label for="tx-cat">Category</label>
			<Select
				id="tx-cat"
				ariaLabel="Category"
				bind:value={category}
				options={accounts.spending_categories}
			/>
		</div>
		<div class="field">
			<label for="tx-fund">Account</label>
			<Select
				id="tx-fund"
				ariaLabel="Account"
				bind:value={funding_account}
				options={accounts.funding_accounts}
				optionLabel={formatAccount}
			/>
		</div>
		<label class="chk"><input type="checkbox" bind:checked={pending} /> Pending</label>
	</div>
</FormSection>

<FormSection label="Reimbursements">
	<Credits
		bind:credits
		creditAccounts={accounts.funding_accounts}
		fundingAccount={funding_account}
	/>
</FormSection>

<EntryFooter
	{editing}
	message={form}
	addLabel="+ Add"
	deleteLabel="Delete transaction"
	deleteQuestion="Delete this transaction?"
	onsubmit={submit}
	ondelete={() => form.remove(locator!)}
>
	{#snippet summary()}
		<span class="share">Your share: <b>{money(yourShare)}</b></span>
		{#if yourShare < 0}
			<span class="net-refund">Reimbursements exceed the bill, so this records a net refund.</span>
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
