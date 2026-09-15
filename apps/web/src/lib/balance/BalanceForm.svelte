<script lang="ts">
	// A balance snapshot posts a pad + balance pair, routing the untracked delta to the account's
	// Equity:Adjustments plug.
	import type { AccountsInfo } from '$lib/data/load';
	import { logBalance } from '$lib/data/load';
	import { formatAccount, money } from '$lib/utils/format';
	import { problems } from '$lib/forms/validate';
	import DatePicker from '$lib/forms/fields/DatePicker.svelte';
	import EntryFooter from '$lib/entries/EntryFooter.svelte';
	import { EntryMessage } from '$lib/entries/entryForm.svelte';
	import FormSection from '$lib/forms/fields/FormSection.svelte';
	import AmountInput from '$lib/ui/AmountInput.svelte';
	import Select from '$lib/forms/fields/Select.svelte';

	interface Props {
		accounts: AccountsInfo;
		presetDate?: string;
		onsaved: () => void;
	}
	let { accounts, presetDate, onsaved }: Props = $props();

	const options = $derived(accounts.balance_accounts ?? []);

	let date = $state('');
	let account = $state('');
	let amount = $state<number | null>(null);

	const message = new EntryMessage();

	$effect(() => {
		if (!date && presetDate) date = presetDate;
		if (!account && options.length) account = options[0]!;
	});

	async function submit() {
		const problem = problems().require(account, 'Account').nonNegative(amount, 'Balance').message();
		if (problem) {
			message.fail(problem);
			return;
		}
		const { error } = await logBalance(account, amount!, date || undefined);
		if (error) {
			message.fail(error);
			return;
		}
		onsaved();
	}
</script>

<FormSection label="When & how much">
	<div class="field-grid">
		<div class="field">
			<label for="bf-date">Date</label>
			<DatePicker id="bf-date" ariaLabel="Date" bind:value={date} />
		</div>
		<div class="field">
			<label for="bf-amt">Balance (USD)</label>
			<AmountInput id="bf-amt" bind:value={amount} />
		</div>
	</div>
</FormSection>

<FormSection label="Account">
	<div class="field">
		<label for="bf-account">Account</label>
		<Select
			id="bf-account"
			bind:value={account}
			options={[...options]}
			optionLabel={formatAccount}
			ariaLabel="Account"
		/>
	</div>
</FormSection>

<EntryFooter editing={false} {message} addLabel="+ Log balance" onsubmit={submit}>
	{#snippet summary()}
		<span class="sets">Sets balance to <b>{money(amount || 0)}</b></span>
	{/snippet}
</EntryFooter>

<style>
	.sets {
		color: var(--ink-2);
		font-size: var(--text-control);
	}
	.sets b {
		color: var(--ink);
		font-size: var(--text-amount);
	}
</style>
