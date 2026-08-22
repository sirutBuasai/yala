<script lang="ts">
	// Add / edit a paycheck. Without `locator` it adds (POST /api/paycheck); with one it prefills
	// from that entry and saves an update (POST /api/paycheck/update) or deletes it.
	import { get } from 'svelte/store';
	import type { AccountsInfo } from '$lib/data';
	import { deleteTransaction, postJson, refreshAccounts } from '$lib/data';
	import { formatAccount, money } from '$lib/format';
	import { lastDepositAccount } from '$lib/editPrefs';
	import Select from './Select.svelte';
	import DatePicker from './DatePicker.svelte';
	import LineColumn, { type AmountRow } from './LineColumn.svelte';
	import DeleteConfirm from './DeleteConfirm.svelte';

	interface Props {
		accounts: AccountsInfo;
		/** When set, edit that paycheck; when absent, add a new one. */
		locator?: string;
		/** Called after a successful save or delete (parent refreshes data + closes the modal). */
		onsaved: () => void;
	}
	let { accounts, locator, onsaved }: Props = $props();

	const editing = $derived(locator != null);

	let date = $state('');
	let gross = $state<number | null>(null);
	let deposit_account = $state('');
	let payee = $state('paycheck');
	let deductions = $state<AmountRow[]>([]);
	let contributions = $state<AmountRow[]>([]);

	let msg = $state('');
	let err = $state(false);

	const toRows = (m: Record<string, number>): AmountRow[] =>
		Object.entries(m).map(([value, amount]) => ({ value, amount }));
	const toMap = (rows: AmountRow[]): Record<string, number> => {
		const m: Record<string, number> = {};
		for (const r of rows) if (r.value && r.amount != null) m[r.value] = r.amount;
		return m;
	};

	$effect(() => {
		if (locator == null) {
			// Add mode: seed the deposit account once accounts load (so a later-loading list still
			// populates it), preferring the last one used this session, without clobbering a pick.
			if (!deposit_account && accounts.cash_accounts.length) {
				const remembered = get(lastDepositAccount);
				deposit_account = accounts.cash_accounts.includes(remembered)
					? remembered
					: accounts.cash_accounts[0];
			}
			return;
		}
		// Edit mode: prefill from the paycheck addressed by `locator`.
		const l = locator;
		(async () => {
			const res = await fetch(`/api/paycheck?locator=${encodeURIComponent(l)}`, {
				cache: 'no-store'
			});
			const s = await res.json();
			if (!res.ok) {
				msg = s.detail || `error ${res.status}`;
				err = true;
				return;
			}
			date = s.date ?? '';
			gross = s.gross ?? null;
			deposit_account = s.deposit_account ?? '';
			payee = s.payee ?? 'paycheck';
			deductions = toRows(s.deductions ?? {});
			contributions = toRows(s.contributions ?? {});
		})();
	});

	const sum = (rows: AmountRow[]) => rows.reduce((a, r) => a + (r.amount || 0), 0);
	const takeHome = $derived((gross || 0) - sum(deductions) - sum(contributions));

	async function addType(kind: 'deduction' | 'contribution', leaf: string) {
		const { ok, error } = await postJson('/api/account', { kind, leaf });
		if (!ok) {
			msg = error ?? 'add failed';
			err = true;
			return;
		}
		await refreshAccounts();
	}

	async function submit() {
		if (gross == null) {
			msg = 'Gross is required.';
			err = true;
			return;
		}
		const body = {
			locator,
			date: date || undefined,
			gross,
			deductions: toMap(deductions),
			contributions: toMap(contributions),
			deposit_account,
			payee: payee.trim() || 'paycheck'
		};
		const { ok, error } = await postJson(editing ? '/api/paycheck/update' : '/api/paycheck', body);
		if (!ok) {
			msg = error ?? 'save failed';
			err = true;
			return;
		}
		if (!editing) lastDepositAccount.set(deposit_account);
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
		<label for="pc-date">Date</label>
		<DatePicker id="pc-date" ariaLabel="Date" bind:value={date} />
	</div>
	<div class="field">
		<label for="pc-gross">Gross</label><input
			id="pc-gross"
			type="number"
			step="0.01"
			placeholder="0"
			bind:value={gross}
		/>
	</div>
	<div class="field">
		<label for="pc-dep">Deposit account</label>
		<Select
			id="pc-dep"
			ariaLabel="Deposit account"
			bind:value={deposit_account}
			options={accounts.cash_accounts}
			optionLabel={formatAccount}
		/>
	</div>
	<div class="field">
		<label for="pc-payee">Payee</label><input id="pc-payee" bind:value={payee} />
	</div>
</div>

<div class="lines">
	<LineColumn
		header="Deductions (Tax, Insurance…)"
		addLabel="+ row"
		bind:rows={deductions}
		options={accounts.deduction_categories}
		selectAriaLabel="deduction type"
		onCreateType={(n) => addType('deduction', n)}
		createPlaceholder="new type (e.g. Dental)"
	/>
	<LineColumn
		header="Contributions (401k, HSA…)"
		addLabel="+ row"
		bind:rows={contributions}
		options={accounts.contribution_categories}
		selectAriaLabel="contribution type"
		onCreateType={(n) => addType('contribution', n)}
		createPlaceholder="new type (e.g. Roth401k)"
	/>
</div>

<div class="foot">
	<span class="takehome">Take-home: <b>{money(takeHome)}</b></span>
	<div class="right">
		{#if msg}<span class="edit-msg" class:err>{msg}</span>{/if}
		{#if editing}
			<div class="actions">
				<button class="btn-primary" onclick={submit}>Save changes</button>
				<DeleteConfirm label="Delete paycheck" question="Delete this paycheck?" ondelete={del} />
			</div>
		{:else}
			<button class="btn-primary" onclick={submit}>+ Add paycheck</button>
		{/if}
	</div>
</div>

<style>
	.editrow {
		display: flex;
		gap: 10px;
		flex-wrap: wrap;
		align-items: flex-end;
		margin-bottom: 12px;
	}
	.editrow .field {
		min-width: 130px;
	}
	.lines {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 18px;
	}
	.foot {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-top: 14px;
		gap: 14px;
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
	.takehome {
		color: var(--ink-2);
		font-size: 13px;
	}
	.takehome b {
		color: var(--good-text);
		font-size: 16px;
	}
	@media (max-width: 640px) {
		.lines {
			grid-template-columns: 1fr;
		}
	}
</style>
