<script lang="ts">
	import type { PaycheckOut } from '$lib/types';
	import { money } from '$lib/format';

	interface Props {
		paychecks: PaycheckOut[];
		/** Edit mode: rows become clickable to open the paycheck editor. */
		edit?: boolean;
		/** Called with the paycheck's locator when a row is clicked (edit mode). */
		onedit?: (locator: string) => void;
	}
	let { paychecks, edit = false, onedit }: Props = $props();

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
</script>

<div class="pctable">
	<div class="pcrow head">
		<span>Date</span>
		<span class="num">Gross</span>
		<span class="num">Tax</span>
		<span class="num">Deductions</span>
		<span class="num">Saved</span>
		<span class="num">Take-home</span>
		<span class="num">Income</span>
	</div>
	{#each rows as r (r.locator)}
		<svelte:element
			this={edit ? 'button' : 'div'}
			class="pcrow"
			class:clickable={edit}
			type={edit ? 'button' : undefined}
			role={edit ? 'button' : undefined}
			onclick={edit ? () => onedit?.(r.locator) : undefined}
		>
			<span>{r.date}</span>
			<span class="num">{money(r.gross)}</span>
			<span class="num">{money(r.tax)}</span>
			<span class="num">{money(r.deductions)}</span>
			<span class="num saved">{money(r.saved)}</span>
			<span class="num">{money(r.takeHome)}</span>
			<span class="num income">{money(r.income)}</span>
		</svelte:element>
	{/each}
</div>

<style>
	.pctable {
		display: flex;
		flex-direction: column;
		overflow-x: auto;
	}
	.pcrow {
		display: grid;
		grid-template-columns: minmax(88px, 1.1fr) repeat(6, 1fr);
		align-items: center;
		gap: 8px;
		padding: 9px 8px;
		border-bottom: 1px solid var(--border);
		font-size: 12.5px;
		/* reset button defaults for the clickable (edit-mode) variant */
		width: 100%;
		background: none;
		border-left: 0;
		border-right: 0;
		border-top: 0;
		color: inherit;
		font-family: inherit;
		text-align: left;
	}
	.pcrow:last-child {
		border-bottom: 0;
	}
	.pcrow.head span {
		color: var(--ink-3);
		font-weight: 600;
		font-size: 10.5px;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}
	.pcrow .num {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
	.pcrow.clickable {
		cursor: pointer;
		border-radius: 8px;
	}
	.pcrow.clickable:hover {
		background: color-mix(in srgb, var(--lav) 9%, transparent);
	}
	.saved {
		color: var(--lav-text);
	}
	.income {
		color: var(--good-text);
		font-weight: 600;
	}
</style>
