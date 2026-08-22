<script lang="ts">
	import { get } from 'svelte/store';
	import type { AccountsInfo } from '$lib/data';
	import { formatAccount, money } from '$lib/format';
	import { lastFundingAccount } from '$lib/editPrefs';
	import AccountField from './AccountField.svelte';
	import Credits, { type Credit } from './Credits.svelte';
	import DatePicker from './DatePicker.svelte';

	const leafOf = (a: string) => a.split(':').pop() ?? a;
	const FUNDING_KINDS = [
		{ value: 'funding_credit', label: 'Credit card' },
		{ value: 'funding_cash', label: 'Cash / bank' }
	] as const;

	interface Props {
		accounts: AccountsInfo;
		/** Called after a successful save (parent refreshes data + closes the modal). */
		onsaved: () => void;
	}
	let { accounts, onsaved }: Props = $props();

	let date = $state('');
	let payee = $state('');
	let total = $state<number | null>(null);
	let category = $state('');
	let funding_account = $state('');
	let pending = $state(false);
	let credits = $state<Credit[]>([]);

	// Seed the selects from the account lists once available (in $effect so a
	// later-loading list still populates them) without clobbering the user's pick.
	// Funding defaults to the last account used this session (if still valid), so
	// repeated adds keep the same payment method pre-selected.
	$effect(() => {
		if (!category) category = accounts.spending_categories[0] ?? '';
		if (!funding_account) {
			const remembered = get(lastFundingAccount);
			funding_account = accounts.funding_accounts.includes(remembered)
				? remembered
				: (accounts.funding_accounts[0] ?? '');
		}
	});

	// Your share = total bill − everything paid back / credited on the credits.
	const paybacks = $derived(credits.reduce((a, s) => a + (s.amount || 0), 0));
	const yourShare = $derived((total || 0) - paybacks);

	let msg = $state('');
	let err = $state(false);

	async function submit() {
		if (!payee.trim() || total == null) {
			msg = 'Title and total bill are required.';
			err = true;
			return;
		}
		const body = {
			date: date || undefined,
			payee: payee.trim(),
			amount: total,
			category,
			funding_account,
			pending,
			credits: credits
				.filter((s) => s.account && s.amount != null)
				.map((s) => ({ account: s.account, amount: s.amount as number }))
		};
		try {
			const res = await fetch('/api/transaction', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok) {
				msg = data.detail || `error ${res.status}`;
				err = true;
				return;
			}
			lastFundingAccount.set(funding_account); // remember for the next add this session
			onsaved();
		} catch (e) {
			msg = 'API unreachable: ' + (e as Error).message;
			err = true;
		}
	}
</script>

<div class="editrow">
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
		<label for="tx-amt">Total bill</label><input
			id="tx-amt"
			type="number"
			step="0.01"
			placeholder="0"
			bind:value={total}
		/>
	</div>
	<AccountField
		id="tx-cat"
		label="Category"
		bind:value={category}
		options={accounts.spending_categories}
		kinds={[{ value: 'category', label: 'Category' }]}
		deriveValue={leafOf}
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

<Credits bind:credits creditAccounts={accounts.credit_accounts} />

<div class="mfoot">
	<span class="share">Your share: <b>{money(yourShare)}</b></span>
	<div class="right">
		{#if msg}<span class="edit-msg" class:err>{msg}</span>{/if}
		<button class="addbtn" onclick={submit}>+ Add</button>
	</div>
</div>

<style>
	.editrow {
		/* Responsive grid: fields wrap onto multiple rows, each wide enough for longer account values. */
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
		gap: 12px;
		align-items: end;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
	}
	.field label {
		font-size: 11px;
		color: var(--ink-3);
		text-transform: uppercase;
		letter-spacing: 0.6px;
	}
	.chk {
		font-size: 12px;
		color: var(--ink-2);
		display: flex;
		align-items: center;
		gap: 6px;
		padding-bottom: 8px;
	}
	.mfoot {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 14px;
		margin-top: 16px;
	}
	.right {
		display: flex;
		align-items: center;
		gap: 14px;
	}
	.share {
		color: var(--ink-2);
		font-size: 13px;
	}
	.share b {
		color: var(--ink);
		font-size: 16px;
	}
	.addbtn {
		background: var(--lav);
		color: #1a1522;
		border: 0;
		border-radius: 9px;
		padding: 9px 16px;
		font-weight: 700;
		cursor: pointer;
	}
	.addbtn:hover {
		filter: brightness(1.08);
	}
	.edit-msg {
		font-size: 12px;
		color: var(--good-text);
	}
	.edit-msg.err {
		color: var(--crit-text);
	}
</style>
