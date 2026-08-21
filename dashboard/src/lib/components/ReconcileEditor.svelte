<script lang="ts">
	import type { AccountsInfo } from '$lib/data';
	import { deleteTransaction } from '$lib/data';
	import { formatAccount, money } from '$lib/format';
	import SplitLegs, { type SplitLeg } from './SplitLegs.svelte';

	interface Props {
		locator: string;
		accounts: AccountsInfo;
		/** Called after a successful update (parent refreshes data + closes the modal). */
		onsaved: () => void;
	}
	let { locator, accounts, onsaved }: Props = $props();

	let loaded = $state(false);
	let date = $state('');
	let payee = $state('');
	let total = $state<number | null>(null);
	let category = $state('');
	let funding_account = $state('');
	let pending = $state(false);
	let splits = $state<SplitLeg[]>([]);

	let msg = $state('');
	let err = $state(false);

	// Prefill from the ledger entry addressed by `locator` (its `amount` is the total bill).
	$effect(() => {
		const l = locator;
		loaded = false;
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
				splits = (s.splits ?? []).map((x: { account: string; amount: number }) => ({
					account: x.account,
					amount: x.amount
				}));
				loaded = true;
			} catch (e) {
				msg = 'API unreachable: ' + (e as Error).message;
				err = true;
			}
		})();
	});

	const paybacks = $derived(splits.reduce((a, s) => a + (s.amount || 0), 0));
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
			splits: splits
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

{#if !loaded && !err}
	<p class="cap">Loading entry…</p>
{/if}

<div class="editrow">
	<div class="field">
		<label for="rc-date">Date</label><input id="rc-date" type="date" bind:value={date} />
	</div>
	<div class="field">
		<label for="rc-payee">Title</label><input id="rc-payee" bind:value={payee} />
	</div>
	<div class="field">
		<label for="rc-amt">Total bill</label><input
			id="rc-amt"
			type="number"
			step="0.01"
			bind:value={total}
		/>
	</div>
	<div class="field">
		<label for="rc-cat">Category</label>
		<select id="rc-cat" bind:value={category}>
			{#each accounts.spending_categories as c (c)}<option value={c}>{c}</option>{/each}
		</select>
	</div>
	<div class="field">
		<label for="rc-fund">Account</label>
		<select id="rc-fund" bind:value={funding_account}>
			{#each accounts.funding_accounts as a (a)}<option value={a}>{formatAccount(a)}</option>{/each}
		</select>
	</div>
	<label class="chk"><input type="checkbox" bind:checked={pending} /> Pending</label>
</div>

<SplitLegs bind:splits splitAccounts={accounts.split_accounts} />

<div class="mfoot">
	<span class="share">Your share: <b>{money(yourShare)}</b></span>
	<div class="right">
		{#if msg}<span class="edit-msg" class:err>{msg}</span>{/if}
		<button class="addbtn" onclick={save}>Save changes</button>
	</div>
</div>

<div class="danger">
	{#if confirmingDelete}
		<span class="confirm-q">Delete this transaction?</span>
		<button type="button" class="del-confirm" onclick={del}>Yes, delete</button>
		<button type="button" class="del-cancel" onclick={() => (confirmingDelete = false)}
			>Cancel</button
		>
	{:else}
		<button type="button" class="del" onclick={() => (confirmingDelete = true)}
			>Delete transaction</button
		>
	{/if}
</div>

<style>
	.editrow {
		display: flex;
		gap: 10px;
		flex-wrap: wrap;
		align-items: flex-end;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 130px;
		flex: 1;
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
		color: var(--good);
	}
	.edit-msg.err {
		color: var(--crit);
	}
	/* Destructive action, set apart from Save so it isn't fat-fingered. */
	.danger {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-top: 22px;
		padding-top: 14px;
		border-top: 1px solid var(--border);
	}
	.confirm-q {
		font-size: 12.5px;
		color: var(--crit);
	}
	.del {
		background: none;
		border: 1px solid color-mix(in srgb, var(--crit) 45%, var(--border));
		color: var(--crit);
		border-radius: 8px;
		padding: 6px 12px;
		font-size: 12px;
		cursor: pointer;
	}
	.del:hover {
		background: color-mix(in srgb, var(--crit) 12%, transparent);
	}
	.del-confirm {
		background: var(--crit);
		color: #1a1522;
		border: 0;
		border-radius: 8px;
		padding: 6px 12px;
		font-size: 12px;
		font-weight: 700;
		cursor: pointer;
	}
	.del-cancel {
		background: none;
		border: 1px solid var(--border);
		color: var(--ink-2);
		border-radius: 8px;
		padding: 6px 12px;
		font-size: 12px;
		cursor: pointer;
	}
</style>
