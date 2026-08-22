<script lang="ts">
	import type { AccountsInfo } from '$lib/data';
	import { refreshAccounts } from '$lib/data';
	import { formatAccount, money } from '$lib/format';

	interface Props {
		accounts: AccountsInfo;
		onsaved: () => void;
	}
	let { accounts, onsaved }: Props = $props();

	interface LineRow {
		leaf: string;
		amount: number | null;
	}

	let date = $state('');
	let gross = $state<number | null>(null);
	let deposit_account = $state('');
	let payee = $state('paycheck');

	// Seed the default deposit account once accounts are available (not at init, so a
	// later-loading accounts list still populates it) — without clobbering a user's pick.
	$effect(() => {
		if (!deposit_account && accounts.cash_accounts.length) {
			deposit_account = accounts.cash_accounts[0];
		}
	});
	let deductions = $state<LineRow[]>([]);
	let contributions = $state<LineRow[]>([]);

	let msg = $state('');
	let err = $state(false);

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
			msg = data.message || 'added type';
			err = false;
		} catch (e) {
			msg = 'API unreachable: ' + (e as Error).message;
			err = true;
		}
	}

	async function submit() {
		if (gross == null) {
			msg = 'Gross is required.';
			err = true;
			return;
		}
		const body = {
			date: date || undefined,
			gross,
			deductions: toMap(deductions),
			contributions: toMap(contributions),
			deposit_account,
			payee: payee.trim() || 'paycheck'
		};
		try {
			const res = await fetch('/api/paycheck', {
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
			msg = data.message || 'saved';
			err = false;
			gross = null;
			deductions = [];
			contributions = [];
			onsaved();
		} catch (e) {
			msg = 'API unreachable: ' + (e as Error).message;
			err = true;
		}
	}
</script>

<div class="editrow">
	<div class="field">
		<label for="pc-date">Date</label><input id="pc-date" type="date" bind:value={date} />
	</div>
	<div class="field">
		<label for="pc-gross">Gross</label><input
			id="pc-gross"
			type="number"
			step="0.01"
			bind:value={gross}
		/>
	</div>
	<div class="field">
		<label for="pc-dep">Deposit account</label>
		<select id="pc-dep" bind:value={deposit_account}>
			{#each accounts.cash_accounts as a (a)}<option value={a}>{formatAccount(a)}</option>{/each}
		</select>
	</div>
	<div class="field">
		<label for="pc-payee">Payee</label><input id="pc-payee" bind:value={payee} />
	</div>
</div>

<div class="lines">
	<div class="linecol">
		<div class="linehdr">
			<span>Deductions (Tax, Insurance…)</span>
			<button class="mini" onclick={addDeduction}>+ row</button>
		</div>
		{#each deductions as row, i (i)}
			<div class="linerow">
				<select bind:value={row.leaf}>
					{#each accounts.deduction_categories as c (c)}<option value={c}>{c}</option>{/each}
				</select>
				<input type="number" step="0.01" bind:value={row.amount} placeholder="0" />
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
			<button class="mini" onclick={addContribution}>+ row</button>
		</div>
		{#each contributions as row, i (i)}
			<div class="linerow">
				<select bind:value={row.leaf}>
					{#each accounts.contribution_categories as c (c)}<option value={c}>{c}</option>{/each}
				</select>
				<input type="number" step="0.01" bind:value={row.amount} placeholder="0" />
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
	<button class="addbtn" onclick={submit}>+ Add paycheck</button>
</div>
{#if msg}<div class="edit-msg" class:err>{msg}</div>{/if}

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
	.linerow select,
	.linerow input {
		flex: 1;
		background: var(--inset);
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
	.newtype {
		display: flex;
		gap: 8px;
		margin-top: 8px;
	}
	.newtype input {
		flex: 1;
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
	.foot {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-top: 14px;
	}
	.takehome {
		color: var(--ink-2);
		font-size: 13px;
	}
	.takehome b {
		color: var(--green);
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
		margin-top: 8px;
		color: var(--good);
	}
	.edit-msg.err {
		color: var(--crit);
	}
	@media (max-width: 700px) {
		.lines {
			grid-template-columns: 1fr;
		}
	}
</style>
