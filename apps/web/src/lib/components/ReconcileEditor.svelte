<script lang="ts">
	import type { AccountsInfo } from '$lib/data';
	import { deleteTransaction } from '$lib/data';
	import { formatAccount, money } from '$lib/format';
	import AccountField from './AccountField.svelte';
	import Credits, { type Credit } from './Credits.svelte';
	import DatePicker from './DatePicker.svelte';

	const leafOf = (a: string) => a.split(':').pop() ?? a;
	const FUNDING_KINDS = [
		{ value: 'funding_credit', label: 'Credit card' },
		{ value: 'funding_cash', label: 'Cash / bank' }
	] as const;

	interface Props {
		locator: string;
		accounts: AccountsInfo;
		/** Called after a successful update (parent refreshes data + closes the modal). */
		onsaved: () => void;
	}
	let { locator, accounts, onsaved }: Props = $props();

	let date = $state('');
	let payee = $state('');
	let total = $state<number | null>(null);
	let category = $state('');
	let funding_account = $state('');
	let pending = $state(false);
	let credits = $state<Credit[]>([]);

	let msg = $state('');
	let err = $state(false);

	// Prefill from the ledger entry addressed by `locator` (its `amount` is the total bill).
	$effect(() => {
		const l = locator;
		(async () => {
			try {
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
					account: x.account,
					amount: x.amount
				}));
			} catch (e) {
				msg = 'API unreachable: ' + (e as Error).message;
				err = true;
			}
		})();
	});

	const paybacks = $derived(credits.reduce((a, s) => a + (s.amount || 0), 0));
	const yourShare = $derived((total || 0) - paybacks);

	let confirmingDelete = $state(false);

	async function del() {
		const problem = await deleteTransaction(locator);
		if (problem) {
			msg = problem;
			err = true;
			confirmingDelete = false;
			return;
		}
		onsaved();
	}

	async function save() {
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
				.filter((s) => s.account && s.amount != null)
				.map((s) => ({ account: s.account, amount: s.amount as number }))
		};
		try {
			const res = await fetch('/api/transaction/update', {
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
			onsaved();
		} catch (e) {
			msg = 'API unreachable: ' + (e as Error).message;
			err = true;
		}
	}
</script>

<div class="editrow">
	<div class="field">
		<label for="rc-date">Date</label>
		<DatePicker id="rc-date" ariaLabel="Date" bind:value={date} />
	</div>
	<div class="field">
		<label for="rc-payee">Title</label><input id="rc-payee" bind:value={payee} />
	</div>
	<div class="field">
		<label for="rc-amt">Total bill</label><input
			id="rc-amt"
			type="number"
			step="0.01"
			placeholder="0"
			bind:value={total}
		/>
	</div>
	<AccountField
		id="rc-cat"
		label="Category"
		bind:value={category}
		options={accounts.spending_categories}
		kinds={[{ value: 'category', label: 'Category' }]}
		deriveValue={leafOf}
	/>
	<AccountField
		id="rc-fund"
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
		<div class="actions">
			<button class="addbtn" onclick={save}>Save changes</button>
			{#if confirmingDelete}
				<div class="confirm">
					<span class="confirm-q">Delete this transaction?</span>
					<button type="button" class="del-confirm" onclick={del}>Yes, delete</button>
					<button type="button" class="del-cancel" onclick={() => (confirmingDelete = false)}
						>Cancel</button
					>
				</div>
			{:else}
				<button type="button" class="delbtn" onclick={() => (confirmingDelete = true)}
					>Delete transaction</button
				>
			{/if}
		</div>
	</div>
</div>

<style>
	.editrow {
		/* Fields wrap onto multiple rows, each staying wide enough for longer account names. */
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
	.addbtn {
		background: var(--lav);
		color: #1a1522;
		border: 0;
		border-radius: 9px;
		padding: 9px 16px;
		font-size: 12px;
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
	/* Destructive action — identical size/weight/shape to Save (bold, explicit 12px),
	   directly beneath it; only the color differs. */
	.delbtn {
		background: var(--crit);
		color: #1a1522;
		border: 0;
		border-radius: 9px;
		padding: 9px 16px;
		font-size: 12px;
		font-weight: 700;
		cursor: pointer;
	}
	.delbtn:hover {
		filter: brightness(1.08);
	}
	.confirm {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		flex-wrap: wrap;
		gap: 8px;
	}
	.confirm-q {
		font-size: 12.5px;
		color: var(--crit-text);
	}
	.del-confirm {
		background: var(--crit);
		color: #1a1522;
		border: 0;
		border-radius: 9px;
		padding: 9px 16px;
		font-size: 12px;
		font-weight: 700;
		cursor: pointer;
	}
	.del-cancel {
		background: none;
		border: 1px solid var(--border);
		color: var(--ink-2);
		border-radius: 9px;
		padding: 9px 16px;
		font-size: 12px;
		cursor: pointer;
	}
</style>
