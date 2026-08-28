<script lang="ts">
	// Add / edit a bill payment (a transfer between your own accounts). Without `locator` it adds
	// (POST /api/transfer); with one it prefills that entry and saves an update or deletes it.
	import { get } from 'svelte/store';
	import type { AccountsInfo } from '$lib/data/load';
	import { deleteTransaction, getJson, postJson } from '$lib/data/load';
	import { formatAccount, money } from '$lib/utils/format';
	import { lastTransferFrom, lastTransferTo } from '$lib/utils/editPrefs';
	import AccountField from '$lib/forms/fields/AccountField.svelte';
	import DatePicker from '$lib/forms/fields/DatePicker.svelte';
	import EntryFooter from '$lib/forms/fields/EntryFooter.svelte';
	import FormSection from '$lib/forms/fields/FormSection.svelte';

	interface Props {
		accounts: AccountsInfo;
		/** When set, edit that transfer; when absent, add a new one. */
		locator?: string;
		/** Add mode only: pre-fill the date field. */
		presetDate?: string;
		/** Called after a successful save or delete. */
		onsaved: () => void;
	}
	let { accounts, locator, presetDate, onsaved }: Props = $props();

	const editing = $derived(locator != null);

	let date = $state('');
	let payee = $state('payment');
	let from_account = $state('');
	let to_account = $state('');
	let amount = $state<number | null>(null);
	let pending = $state(false);

	let msg = $state('');
	let err = $state(false);

	// `credit_accounts` is the full money-in set (banks, Venmo, and credit cards); a bill pay can
	// target any of them except the account being paid from.
	const toAccounts = $derived(accounts.credit_accounts.filter((a) => a !== from_account));

	const seed = (remembered: string, options: string[]): string =>
		options.includes(remembered) ? remembered : (options[0] ?? '');

	$effect(() => {
		if (locator == null) {
			if (!date && presetDate) date = presetDate;
			if (!from_account) from_account = seed(get(lastTransferFrom), accounts.cash_accounts);
			if (!to_account) to_account = seed(get(lastTransferTo), toAccounts);
			return;
		}
		const l = locator;
		(async () => {
			const {
				ok,
				data: s,
				error
			} = await getJson<Record<string, any>>(`/api/transfer?locator=${encodeURIComponent(l)}`);
			if (!ok) {
				msg = error ?? 'load failed';
				err = true;
				return;
			}
			date = s.date ?? '';
			payee = s.payee ?? 'payment';
			from_account = s.from_account ?? '';
			to_account = s.to_account ?? '';
			amount = s.amount ?? null;
			pending = !!s.pending;
		})();
	});

	async function submit() {
		if (amount == null || amount <= 0) {
			msg = 'Enter an amount to move.';
			err = true;
			return;
		}
		if (from_account === to_account) {
			msg = 'Pick two different accounts.';
			err = true;
			return;
		}
		const body = {
			locator,
			date: date || undefined,
			payee: payee.trim() || 'payment',
			from_account,
			to_account,
			amount,
			pending
		};
		const { ok, error } = await postJson(editing ? '/api/transfer/update' : '/api/transfer', body);
		if (!ok) {
			msg = error ?? 'save failed';
			err = true;
			return;
		}
		if (!editing) {
			lastTransferFrom.set(from_account);
			lastTransferTo.set(to_account);
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

<FormSection label="When & how much">
	<div class="field-grid">
		<div class="field">
			<label for="tf-date">Date</label>
			<DatePicker id="tf-date" ariaLabel="Date" bind:value={date} />
		</div>
		<div class="field">
			<label for="tf-amt">Amount</label><input
				id="tf-amt"
				type="number"
				step="0.01"
				placeholder="0"
				bind:value={amount}
			/>
		</div>
	</div>
</FormSection>

<FormSection label="Accounts">
	<div class="field-grid">
		<AccountField
			id="tf-from"
			label="Pay from"
			bind:value={from_account}
			options={accounts.cash_accounts}
			optionLabel={formatAccount}
			kinds={[{ value: 'funding_cash', label: 'Cash / bank' }]}
		/>
		<AccountField
			id="tf-to"
			label="Pay toward"
			bind:value={to_account}
			options={toAccounts}
			optionLabel={formatAccount}
			kinds={[
				{ value: 'funding_cash', label: 'Cash / bank' },
				{ value: 'funding_credit', label: 'Credit card' }
			]}
		/>
	</div>
</FormSection>

<FormSection label="Details">
	<div class="field-grid">
		<div class="field">
			<label for="tf-payee">Note</label><input id="tf-payee" bind:value={payee} />
		</div>
		<label class="chk"><input type="checkbox" bind:checked={pending} /> Pending</label>
	</div>
</FormSection>

<EntryFooter
	{editing}
	{msg}
	{err}
	addLabel="+ Add"
	deleteLabel="Delete bill pay"
	deleteQuestion="Delete this bill payment?"
	onsubmit={submit}
	ondelete={del}
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
