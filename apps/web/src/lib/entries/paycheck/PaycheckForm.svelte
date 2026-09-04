<script lang="ts">
	// Add / edit a paycheck. Without `locator` it adds (POST /api/paycheck); with one it prefills
	// from that entry and saves an update (POST /api/paycheck/update) or deletes it.
	import { untrack } from 'svelte';
	import { get } from 'svelte/store';
	import type { AccountsInfo } from '$lib/data/load';
	import { deleteTransaction, getJson, postJson } from '$lib/data/load';
	import { formatAccount, money } from '$lib/utils/format';
	import {
		lastContributionLabels,
		lastDeductionLabels,
		lastDepositAccount,
		lastEmployer,
		lastEntryDate,
		seed
	} from '$lib/utils/editPrefs';
	import { problems, TEXT_MAX, validateRows } from '$lib/forms/validate';
	import Select from '$lib/forms/fields/Select.svelte';
	import DatePicker from '$lib/forms/fields/DatePicker.svelte';
	import LineColumn, { type AmountRow } from '$lib/forms/fields/LineColumn.svelte';
	import EntryFooter from '$lib/entries/EntryFooter.svelte';
	import FormSection from '$lib/forms/fields/FormSection.svelte';
	import AmountInput from '$lib/ui/AmountInput.svelte';

	interface Props {
		accounts: AccountsInfo;
		/** When set, edit that paycheck; when absent, add a new one. */
		locator?: string;
		/** Add mode only: pre-fill the date field (e.g. the day clicked in the calendar). */
		presetDate?: string;
		/** Called after a successful save or delete (parent refreshes data + closes the modal). */
		onsaved: () => void;
	}
	let { accounts, locator, presetDate, onsaved }: Props = $props();

	const editing = $derived(locator != null);

	let date = $state('');
	let employer = $state('');
	let gross = $state<number | null>(null);
	let deposit_account = $state('');
	let payee = $state('Paycheck');
	let deductions = $state<AmountRow[]>([]);
	let contributions = $state<AmountRow[]>([]);

	let msg = $state('');
	let err = $state(false);

	// Option labels the selected employer offers, plus generic ones (employer === null).
	const scoped = (kind: 'deduction' | 'contribution'): string[] =>
		accounts.payroll_options
			.filter((o) => o.kind === kind && (o.employer === null || o.employer === employer))
			.map((o) => o.label);
	const deductionOptions = $derived(scoped('deduction'));
	const contributionOptions = $derived(scoped('contribution'));

	const toRows = (m: Record<string, number>): AmountRow[] =>
		Object.entries(m).map(([value, amount]) => ({ value, amount }));

	/** Remembered labels as blank rows, dropping any the current employer no longer offers. Amounts
	    stay null: the shape carries over, the figures never do. */
	const emptyRows = (labels: string[], options: string[]): AmountRow[] =>
		labels.filter((l) => options.includes(l)).map((value) => ({ value, amount: null }));

	/** Guards the one-time row seeding below; see the comment there for why it can't be reactive. */
	let rowsSeeded = false;
	// Same-label rows sum (e.g. two "Benefits" lines) rather than the last overwriting.
	const toMap = (rows: AmountRow[]): Record<string, number> => {
		const m: Record<string, number> = {};
		for (const r of rows)
			if (r.value && r.amount != null) m[r.value] = (m[r.value] ?? 0) + r.amount;
		return m;
	};

	$effect(() => {
		if (locator == null) {
			// Add mode: employer, deposit account and the deduction/contribution ROWS all carry over — a
			// paycheck keeps its shape month to month, so only the figures should need typing.
			if (!date && presetDate) date = presetDate;
			if (!employer) employer = seed(get(lastEmployer), accounts.employers);
			if (!deposit_account) deposit_account = seed(get(lastDepositAccount), accounts.cash_accounts);
			// The ROWS are seeded once and untracked, unlike the scalars above. `scoped()` reads
			// `employer`, which this same effect just wrote, and the rows are this effect's own output —
			// tracking either would make the effect depend on what it produces and loop.
			if (!rowsSeeded && accounts.payroll_options.length) {
				rowsSeeded = true;
				untrack(() => {
					deductions = emptyRows(get(lastDeductionLabels), scoped('deduction'));
					contributions = emptyRows(get(lastContributionLabels), scoped('contribution'));
				});
			}
			return;
		}
		// Edit mode: prefill from the paycheck addressed by `locator`.
		const l = locator;
		(async () => {
			const {
				ok,
				data: s,
				error
			} = await getJson<Record<string, any>>(`/api/paycheck?locator=${encodeURIComponent(l)}`);
			if (!ok) {
				msg = error ?? 'load failed';
				err = true;
				return;
			}
			date = s.date ?? '';
			employer = s.employer ?? accounts.employers[0] ?? '';
			gross = s.gross ?? null;
			deposit_account = s.deposit_account ?? '';
			payee = s.payee ?? 'Paycheck';
			deductions = toRows(s.deductions ?? {});
			contributions = toRows(s.contributions ?? {});
		})();
	});

	const sum = (rows: AmountRow[]) => rows.reduce((a, r) => a + (r.amount || 0), 0);
	const takeHome = $derived((gross || 0) - sum(deductions) - sum(contributions));

	async function submit() {
		const problem = problems()
			.positive(gross, 'Gross')
			.require(employer, 'Employer')
			.require(deposit_account, 'Deposit account')
			.add(validateRows(deductions, 'deduction'))
			.add(validateRows(contributions, 'contribution'))
			.add(takeHome < 0 ? 'Deductions and contributions exceed gross pay.' : null)
			.message();
		if (problem) {
			msg = problem;
			err = true;
			return;
		}
		const body = {
			locator,
			date: date || undefined,
			employer,
			gross,
			deductions: toMap(deductions),
			contributions: toMap(contributions),
			deposit_account,
			payee: payee.trim() || 'Paycheck'
		};
		const { ok, error } = await postJson(editing ? '/api/paycheck/update' : '/api/paycheck', body);
		if (!ok) {
			msg = error ?? 'save failed';
			err = true;
			return;
		}
		if (!editing) {
			lastDepositAccount.set(deposit_account);
			lastEntryDate.set(date);
			lastEmployer.set(employer);
			// Only rows that actually carried a figure: an untouched row is one you didn't want.
			lastDeductionLabels.set(Object.keys(toMap(deductions)));
			lastContributionLabels.set(Object.keys(toMap(contributions)));
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

<FormSection label="Paycheck">
	<div class="field-grid">
		<div class="field">
			<label for="pc-date">Date</label>
			<DatePicker id="pc-date" ariaLabel="Date" bind:value={date} />
		</div>
		<div class="field">
			<label for="pc-employer">Employer</label>
			<Select
				id="pc-employer"
				ariaLabel="Employer"
				bind:value={employer}
				options={accounts.employers}
			/>
		</div>
		<div class="field">
			<label for="pc-gross">Gross</label>
			<AmountInput id="pc-gross" bind:value={gross} />
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
			<label for="pc-payee">Payee</label><input
				id="pc-payee"
				bind:value={payee}
				maxlength={TEXT_MAX}
			/>
		</div>
	</div>
</FormSection>

<FormSection label="Deductions">
	<LineColumn
		header="Tax, benefits, insurance…"
		addLabel="+ row"
		bind:rows={deductions}
		options={deductionOptions}
		selectAriaLabel="deduction type"
	/>
</FormSection>

<FormSection label="Contributions">
	<LineColumn
		header="401k, HSA…"
		addLabel="+ row"
		bind:rows={contributions}
		options={contributionOptions}
		selectAriaLabel="contribution type"
	/>
</FormSection>

<EntryFooter
	{editing}
	bind:msg
	bind:err
	addLabel="+ Add"
	deleteLabel="Delete paycheck"
	deleteQuestion="Delete this paycheck?"
	onsubmit={submit}
	ondelete={del}
>
	{#snippet summary()}
		<span class="takehome">Take-home: <b>{money(takeHome)}</b></span>
	{/snippet}
</EntryFooter>

<style>
	.takehome {
		color: var(--ink-2);
		font-size: var(--text-control);
	}
	.takehome b {
		color: var(--good-text);
		font-size: var(--text-amount);
	}
</style>
