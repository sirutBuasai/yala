<script lang="ts">
	import type { PaycheckOut } from '$lib/types';
	import { money } from '$lib/format';
	import { sumValues } from '$lib/num';

	interface Props {
		paychecks: PaycheckOut[];
		/** Edit mode: rows become clickable to open the paycheck editor. */
		edit?: boolean;
		/** Called with the paycheck's locator when a row is clicked (edit mode). */
		onedit?: (locator: string) => void;
	}
	let { paychecks, edit = false, onedit }: Props = $props();

	// Chronological order; no totals row (year aggregates live in the KPIs).
	const rows = $derived(
		[...paychecks]
			.sort((a, b) => a.date.localeCompare(b.date))
			.map((p) => ({
				locator: p.locator,
				date: p.date,
				gross: p.gross,
				tax: p.deductions['Tax'] ?? 0,
				deductions: sumValues(p.deductions) - (p.deductions['Tax'] ?? 0),
				saved: sumValues(p.contributions),
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
		/* bleed to the enclosing card's edges (20px h-padding) so row hover runs edge-to-edge;
		   the +20px in the row padding below keeps the columns where they were. */
		margin: 0 -20px;
	}
	.pcrow {
		position: relative;
		display: grid;
		grid-template-columns: minmax(88px, 1.1fr) repeat(6, 1fr);
		align-items: center;
		gap: 8px;
		padding: 9px 28px;
		font-size: 12.5px;
		/* reset button defaults for the clickable (edit-mode) variant */
		width: 100%;
		background: none;
		border: 0;
		color: inherit;
		font-family: inherit;
		text-align: left;
	}
	/* divider stays inset to the content while the row hover is full-bleed */
	.pcrow:not(:last-child)::after {
		content: '';
		position: absolute;
		left: 20px;
		right: 20px;
		bottom: 0;
		height: 1px;
		background: var(--border);
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
	/* full-width square hover (app standard for stacked/list rows) */
	.pcrow.clickable {
		cursor: pointer;
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
