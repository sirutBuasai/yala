<script lang="ts">
	import type { PaycheckOut } from '$lib/types';
	import { money } from '$lib/format';
	import { deleteTransaction } from '$lib/data';

	interface Props {
		paychecks: PaycheckOut[];
		/** Edit mode: show a per-row delete affordance. */
		editable?: boolean;
		/** Called after a paycheck is deleted (parent reloads data). */
		onDeleted?: () => void;
	}
	let { paychecks, editable = false, onDeleted }: Props = $props();

	const sum = (m: Record<string, number>) => Object.values(m).reduce((a, b) => a + b, 0);
	// Chronological order; no totals row (year aggregates live in the KPIs).
	const rows = $derived(
		[...paychecks]
			.sort((a, b) => a.date.localeCompare(b.date))
			.map((p) => ({
				locator: p.locator,
				date: p.date,
				gross: p.gross,
				tax: p.deductions['Tax'] ?? 0,
				deductions: sum(p.deductions) - (p.deductions['Tax'] ?? 0),
				saved: sum(p.contributions),
				takeHome: p.take_home,
				income: p.net
			}))
	);

	async function del(locator: string, date: string) {
		if (!confirm(`Delete the paycheck dated ${date}?`)) return;
		const problem = await deleteTransaction(locator);
		if (problem) {
			alert(problem);
			return;
		}
		onDeleted?.();
	}
</script>

<div class="wrap">
	<table>
		<thead>
			<tr>
				<th>Date</th>
				<th class="num">Gross</th>
				<th class="num">Tax</th>
				<th class="num">Deductions</th>
				<th class="num">Saved</th>
				<th class="num">Take-home</th>
				<th class="num">Income</th>
				{#if editable}<th class="del-col"></th>{/if}
			</tr>
		</thead>
		<tbody>
			{#each rows as r (r.locator)}
				<tr>
					<td>{r.date}</td>
					<td class="num">{money(r.gross)}</td>
					<td class="num">{money(r.tax)}</td>
					<td class="num">{money(r.deductions)}</td>
					<td class="num saved">{money(r.saved)}</td>
					<td class="num">{money(r.takeHome)}</td>
					<td class="num income">{money(r.income)}</td>
					{#if editable}
						<td class="del-col">
							<button
								type="button"
								class="del"
								title="Delete paycheck"
								onclick={() => del(r.locator, r.date)}>✕</button
							>
						</td>
					{/if}
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	.wrap {
		overflow-x: auto;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 12.5px;
	}
	th,
	td {
		padding: 9px 8px;
		border-bottom: 1px solid var(--border);
		text-align: left;
		white-space: nowrap;
	}
	th.num,
	td.num {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
	th {
		color: var(--ink-3);
		font-weight: 600;
		font-size: 10.5px;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}
	td.saved {
		color: var(--lav-text);
	}
	td.income {
		color: var(--good-text);
		font-weight: 600;
	}
	.del-col {
		width: 28px;
		text-align: center;
	}
	.del {
		background: none;
		border: 0;
		color: var(--ink-3);
		cursor: pointer;
		font-size: 12px;
		padding: 2px 4px;
		border-radius: 6px;
	}
	.del:hover {
		color: var(--crit-text);
		background: color-mix(in srgb, var(--crit) 12%, transparent);
	}
</style>
