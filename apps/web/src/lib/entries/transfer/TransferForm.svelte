<script lang="ts">
	// Add / edit a bill payment (a transfer between your own accounts). Without `locator` it adds;
	// with one it prefills that entry and saves an update or deletes it.
	import { get } from 'svelte/store';
	import { EntryForm, type EntryFormProps } from '$lib/entries/entryForm.svelte';
	import { formatAccount, money } from '$lib/utils/format';
	import { lastEntryDate, lastTransferFrom, lastTransferTo, seed } from '$lib/utils/editPrefs';
	import { problems, TEXT_MAX } from '$lib/forms/validate';
	import DatePicker from '$lib/forms/fields/DatePicker.svelte';
	import EntryFooter from '$lib/entries/EntryFooter.svelte';
	import FormSection from '$lib/forms/fields/FormSection.svelte';
	import Select from '$lib/forms/fields/Select.svelte';
	import AmountInput from '$lib/ui/AmountInput.svelte';

	let { accounts, locator, presetDate, onsaved }: EntryFormProps = $props();

	const editing = $derived(locator != null);

	let date = $state('');
	let payee = $state('payment');
	let from_account = $state('');
	let to_account = $state('');
	let amount = $state<number | null>(null);
	let pending = $state(false);

	const form = new EntryForm('transfer', () => onsaved());

	// A bill pay can target any money-in account except the one being paid from.
	const toAccounts = $derived(accounts.funding_accounts.filter((a) => a !== from_account));

	$effect(() => {
		if (locator == null) {
			if (!date && presetDate) date = presetDate;
			if (!from_account) from_account = seed(get(lastTransferFrom), accounts.cash_accounts);
			if (!to_account) to_account = seed(get(lastTransferTo), toAccounts);
			return;
		}
		void form.load(locator, (s) => {
			date = s.date ?? '';
			payee = s.payee ?? 'payment';
			from_account = s.from_account ?? '';
			to_account = s.to_account ?? '';
			amount = s.amount ?? null;
			pending = !!s.pending;
		});
	});

	function submit() {
		const problem = problems()
			.positive(amount, 'Amount')
			.require(from_account, 'Pay-from account')
			.require(to_account, 'Pay-toward account')
			.add(from_account === to_account ? 'Pick two different accounts.' : null)
			.message();
		const body = {
			locator,
			date: date || undefined,
			payee: payee.trim() || 'payment',
			from_account,
			to_account,
			amount,
			pending
		};
		void form.save(problem, body, () => {
			lastTransferFrom.set(from_account);
			lastTransferTo.set(to_account);
			lastEntryDate.set(date);
		});
	}
</script>

<FormSection label="When & how much">
	<div class="field-grid">
		<div class="field">
			<label for="tf-date">Date</label>
			<DatePicker id="tf-date" ariaLabel="Date" bind:value={date} />
		</div>
		<div class="field">
			<label for="tf-amt">Amount</label>
			<AmountInput id="tf-amt" bind:value={amount} />
		</div>
	</div>
</FormSection>

<FormSection label="Accounts">
	<div class="field-grid">
		<div class="field">
			<label for="tf-from">Pay from</label>
			<Select
				id="tf-from"
				ariaLabel="Pay from"
				bind:value={from_account}
				options={accounts.cash_accounts}
				optionLabel={formatAccount}
			/>
		</div>
		<div class="field">
			<label for="tf-to">Pay toward</label>
			<Select
				id="tf-to"
				ariaLabel="Pay toward"
				bind:value={to_account}
				options={toAccounts}
				optionLabel={formatAccount}
			/>
		</div>
	</div>
</FormSection>

<FormSection label="Details">
	<div class="field-grid">
		<div class="field">
			<label for="tf-payee">Note</label><input
				id="tf-payee"
				bind:value={payee}
				maxlength={TEXT_MAX}
			/>
		</div>
		<label class="chk"><input type="checkbox" bind:checked={pending} /> Pending</label>
	</div>
</FormSection>

<EntryFooter
	{editing}
	message={form}
	addLabel="+ Add"
	deleteLabel="Delete bill pay"
	deleteQuestion="Delete this bill payment?"
	onsubmit={submit}
	ondelete={() => form.remove(locator!)}
>
	{#snippet summary()}
		<span class="moves">Moves <b>{money(amount || 0)}</b></span>
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
	.moves {
		color: var(--ink-2);
		font-size: var(--text-control);
	}
	.moves b {
		color: var(--ink);
		font-size: var(--text-amount);
	}
</style>
