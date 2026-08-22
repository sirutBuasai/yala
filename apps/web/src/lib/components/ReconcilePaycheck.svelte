<script lang="ts">
	import type { AccountsInfo } from '$lib/data';
	import { deleteTransaction, refreshAccounts } from '$lib/data';
	import { formatAccount, money } from '$lib/format';
	import Select from './Select.svelte';
	import DatePicker from './DatePicker.svelte';

	interface Props {
		locator: string;
		accounts: AccountsInfo;
		/** Called after a successful update or delete (parent refreshes + closes). */
		onsaved: () => void;
	}
	let { locator, accounts, onsaved }: Props = $props();

	interface LineRow {
		leaf: string;
		amount: number | null;
	}

	let date = $state('');
	let gross = $state<number | null>(null);
	let deposit_account = $state('');
	let payee = $state('paycheck');
	let deductions = $state<LineRow[]>([]);
	let contributions = $state<LineRow[]>([]);

	let msg = $state('');
	let err = $state(false);
	let confirmingDelete = $state(false);

	const toRows = (m: Record<string, number>): LineRow[] =>
		Object.entries(m).map(([leaf, amount]) => ({ leaf, amount }));

	// Prefill from the paycheck addressed by `locator`.
	$effect(() => {
		const l = locator;
		(async () => {
			try {
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
			} catch (e) {
				msg = 'API unreachable: ' + (e as Error).message;
				err = true;
			}
		})();
	});

	const sum = (rows: LineRow[]) => rows.reduce((a, r) => a + (r.amount || 0), 0);
	const takeHome = $derived((gross || 0) - sum(deductions) - sum(contributions));

	function addDeduction() {
		deductions = [...deductions, { leaf: accounts.deduction_categories[0] ?? '', amount: null }];
	}
	function addContribution() {
		contributions = [
			...contributions,
			{ leaf: accounts.contribution_categories[0] ?? '', amount: null }
		];
	}
	function removeDeduction(i: number) {
		deductions = deductions.filter((_, idx) => idx !== i);
	}
	function removeContribution(i: number) {
		contributions = contributions.filter((_, idx) => idx !== i);
	}
	function toMap(rows: LineRow[]): Record<string, number> {
		const m: Record<string, number> = {};
		for (const r of rows) if (r.leaf && r.amount != null) m[r.leaf] = r.amount;
		return m;
	}

	let newDeduction = $state('');
	let newContribution = $state('');

	async function addType(kind: 'deduction' | 'contribution', leaf: string) {
		if (!leaf.trim()) return;
		try {
			const res = await fetch('/api/account', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ kind, leaf: leaf.trim() })
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok) {
				msg = data.detail || `error ${res.status}`;
				err = true;
				return;
			}
			await refreshAccounts();
			if (kind === 'deduction') newDeduction = '';
			else newContribution = '';
			err = false;
		} catch (e) {
			msg = 'API unreachable: ' + (e as Error).message;
			err = true;
		}
	}

	async function save() {
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
		try {
			const res = await fetch('/api/paycheck/update', {
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
</script>

<div class="editrow">
	<div class="field">
		<label for="rp-date">Date</label>
		<DatePicker id="rp-date" ariaLabel="Date" bind:value={date} />
	</div>
	<div class="field">
		<label for="rp-gross">Gross</label><input
			id="rp-gross"
			type="number"
			step="0.01"
			placeholder="0"
			bind:value={gross}
		/>
	</div>
	<div class="field">
		<label for="rp-dep">Deposit account</label>
		<Select
			id="rp-dep"
			ariaLabel="Deposit account"
			bind:value={deposit_account}
			options={accounts.cash_accounts}
			optionLabel={formatAccount}
		/>
	</div>
	<div class="field">
		<label for="rp-payee">Payee</label><input id="rp-payee" bind:value={payee} />
	</div>
</div>

<div class="lines">
	<div class="linecol">
		<div class="linehdr">
			<span>Deductions (Tax, Insurance…)</span>
			<button type="button" class="mini" onclick={addDeduction}>+ row</button>
		</div>
		{#each deductions as row, i (i)}
			<div class="linerow">
				<div class="grow">
					<Select
						ariaLabel="deduction type"
						bind:value={row.leaf}
						options={accounts.deduction_categories}
					/>
				</div>
				<input type="number" step="0.01" bind:value={row.amount} placeholder="0" />
				<button type="button" class="mini rm" onclick={() => removeDeduction(i)}>✕</button>
			</div>
		{/each}
		<div class="newtype">
			<input bind:value={newDeduction} placeholder="new type (e.g. Dental)" />
			<button type="button" class="mini" onclick={() => addType('deduction', newDeduction)}
				>+ type</button
			>
		</div>
	</div>
	<div class="linecol">
		<div class="linehdr">
			<span>Contributions (401k, HSA…)</span>
			<button type="button" class="mini" onclick={addContribution}>+ row</button>
		</div>
		{#each contributions as row, i (i)}
			<div class="linerow">
				<div class="grow">
					<Select
						ariaLabel="contribution type"
						bind:value={row.leaf}
						options={accounts.contribution_categories}
					/>
				</div>
				<input type="number" step="0.01" bind:value={row.amount} placeholder="0" />
				<button type="button" class="mini rm" onclick={() => removeContribution(i)}>✕</button>
			</div>
		{/each}
		<div class="newtype">
			<input bind:value={newContribution} placeholder="new type (e.g. Roth401k)" />
			<button type="button" class="mini" onclick={() => addType('contribution', newContribution)}
				>+ type</button
			>
		</div>
	</div>
</div>

<div class="foot">
	<span class="takehome">Take-home: <b>{money(takeHome)}</b></span>
	<div class="right">
		{#if msg}<span class="edit-msg" class:err>{msg}</span>{/if}
		<div class="actions">
			<button class="addbtn" onclick={save}>Save changes</button>
			{#if confirmingDelete}
				<div class="confirm">
					<span class="confirm-q">Delete this paycheck?</span>
					<button type="button" class="del-confirm" onclick={del}>Yes, delete</button>
					<button type="button" class="del-cancel" onclick={() => (confirmingDelete = false)}
						>Cancel</button
					>
				</div>
			{:else}
				<button type="button" class="delbtn" onclick={() => (confirmingDelete = true)}
					>Delete paycheck</button
				>
			{/if}
		</div>
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
	.lines {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 18px;
	}
	.linehdr {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 12px;
		color: var(--ink-2);
		margin-bottom: 6px;
	}
	.linerow {
		display: flex;
		gap: 8px;
		margin-bottom: 6px;
	}
	.linerow .grow {
		flex: 1;
		min-width: 0;
	}
	.linerow input {
		flex: 1;
		min-width: 0; /* allow shrinking so the two columns never overflow the drawer */
		background-color: var(--inset);
		border: 1px solid var(--border);
		color: var(--ink);
		border-radius: 8px;
		padding: 6px 9px;
		font-size: 12.5px;
		font-family: inherit;
	}
	.mini {
		background: none;
		border: 1px solid var(--border);
		color: var(--ink-2);
		border-radius: 7px;
		padding: 3px 9px;
		cursor: pointer;
		font-size: 11.5px;
	}
	.mini.rm {
		flex: 0 0 auto;
	}
	.mini.rm:hover {
		border-color: var(--crit);
		color: var(--crit-text);
	}
	.newtype {
		display: flex;
		gap: 8px;
		margin-top: 8px;
	}
	.newtype input {
		flex: 1;
		min-width: 0;
		background: var(--inset);
		border: 1px dashed var(--border);
		color: var(--ink);
		border-radius: 8px;
		padding: 6px 9px;
		font-size: 12px;
		font-family: inherit;
	}
	.newtype .mini {
		flex: 0 0 auto;
	}
	@media (max-width: 640px) {
		.lines {
			grid-template-columns: 1fr;
		}
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
