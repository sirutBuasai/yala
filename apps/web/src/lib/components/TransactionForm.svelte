<script lang="ts">
	// Add / edit a transaction. Without `locator` it adds (POST /api/transaction); with one it
	// prefills from that entry and saves an update (POST /api/transaction/update) or deletes it.
	import { get } from 'svelte/store';
	import type { AccountsInfo } from '$lib/data';
	import { deleteTransaction, postJson } from '$lib/data';
	import { formatAccount, money } from '$lib/format';
	import { lastFundingAccount } from '$lib/editPrefs';
	import AccountField from './AccountField.svelte';
	import Credits, { type Credit } from './Credits.svelte';
	import DatePicker from './DatePicker.svelte';
	import DeleteConfirm from './DeleteConfirm.svelte';

	const leafOf = (a: string) => a.split(':').pop() ?? a;
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
			// still populates them) without clobbering the user's pick. Funding defaults to the last
			// account used this session, so repeated adds keep the same method.
			if (!date && presetDate) date = presetDate;
			if (!category) category = accounts.spending_categories[0] ?? '';
			if (!funding_account) {
				const remembered = get(lastFundingAccount);
				funding_account = accounts.funding_accounts.includes(remembered)
					? remembered
					: (accounts.funding_accounts[0] ?? '');
			}
			return;
		}
		// Edit mode: prefill from the ledger entry (its `amount` is the total bill).
		const l = locator;
		(async () => {
			const res = await fetch(`/api/transaction?locator=${encodeURIComponent(l)}`, {
				cache: 'no-store'
			});
			const s = await res.json();
			if (!res.ok) {
				msg = s.detail || `error ${res.status}`;
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
		if (!payee.trim() || total == null) {
			msg = 'Title and total bill are required.';
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
		if (!editing) lastFundingAccount.set(funding_account);
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
		{#if editing}
			<div class="actions">
				<button class="btn-primary" onclick={submit}>Save changes</button>
				<DeleteConfirm
					label="Delete transaction"
					question="Delete this transaction?"
					ondelete={del}
				/>
			</div>
		{:else}
			<button class="btn-primary" onclick={submit}>+ Add</button>
		{/if}
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
		align-items: flex-start;
		gap: 14px;
		margin-top: 16px;
	}
	.right {
		display: flex;
		align-items: flex-start;
		gap: 14px;
	}
	/* Save changes and Delete stack, so Delete sits directly beneath Save (same width). */
	.actions {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 8px;
	}
	.share {
		color: var(--ink-2);
		font-size: 13px;
	}
	.share b {
		color: var(--ink);
		font-size: 16px;
	}
</style>
