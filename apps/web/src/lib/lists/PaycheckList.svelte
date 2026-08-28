<script module lang="ts">
	// Figures a paycheck row can break out into its own aligned column, in the order given. Each
	// token maps to a fixed figure so columns line up across rows. 'saved' sums the contributions
	// (401k…); 'deductions' sums every deduction entry.
	type PaycheckField = 'gross' | 'tax' | 'benefits' | 'deductions' | 'saved' | 'takehome' | 'net';
</script>

<script lang="ts">
	import type { PaycheckOut } from '$lib/data/types';
	import { money } from '$lib/utils/format';
	import { sumValues } from '$lib/utils/num';
	import RowList from '$lib/lists/RowList.svelte';

	interface Props {
		paychecks: PaycheckOut[];
		/** Edit mode: rows become clickable to open the paycheck editor. */
		edit?: boolean;
		onedit?: (locator: string) => void;
		/** Hide the per-row date (e.g. in the calendar day panel, which already names the day). */
		showDate?: boolean;
		/** Which figures to break out into columns, in order. Trailing amount is always net. */
		fields?: PaycheckField[];
		/** Fix the list to this many rows tall, then scroll (see RowList). */
		fixedRows?: number;
	}
	let {
		paychecks,
		edit = false,
		onedit,
		showDate = true,
		fields = ['gross', 'takehome'],
		fixedRows
	}: Props = $props();

	const LABELS: Record<PaycheckField, string> = {
		gross: 'gross',
		tax: 'tax',
		benefits: 'benefits',
		deductions: 'deductions',
		saved: 'saved',
		takehome: 'take-home',
		net: 'income'
	};

	function value(p: PaycheckOut, f: PaycheckField): number {
		switch (f) {
			case 'gross':
				return p.gross;
			case 'tax':
				return p.deductions['Tax'] ?? 0;
			case 'benefits':
				return p.deductions['Benefits'] ?? 0;
			case 'deductions':
				return sumValues(p.deductions);
			case 'saved':
				return sumValues(p.contributions);
			case 'takehome':
				return p.take_home;
			case 'net':
				return p.net;
		}
	}

	// The breakout figures live in one grid cell (a flex row) rather than one track each, so they
	// collapse as a unit — and hide entirely — when the pane is too narrow to read them.
	const cols = $derived(`${showDate ? '34px ' : ''}10px 1fr auto 74px`);
</script>

<div class="pc">
	<RowList
		items={paychecks}
		{edit}
		{onedit}
		{cols}
		{fixedRows}
		density="comfortable"
		dotColor={() => 'var(--saved)'}
		dateOf={showDate ? (p) => p.date : undefined}
	>
		{#snippet main(p)}
			<span class="title">{p.payee}</span>
		{/snippet}
		{#snippet columns(p)}
			<span class="figs">
				{#each fields as f (f)}
					<span class="fig">
						<span class="flabel">{LABELS[f]}</span>
						<span class="fval">{money(value(p, f))}</span>
					</span>
				{/each}
			</span>
		{/snippet}
		{#snippet amount(p)}
			<span class="amt pos">+{money(p.net)}</span>
		{/snippet}
	</RowList>
</div>

<style>
	.pc {
		/* size-container so the figure cell can hide when the pane is too narrow for it */
		container-type: inline-size;
	}
	.title {
		font-size: var(--text-row);
		font-weight: var(--fw-medium);
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	/* the breakout figures as one right-aligned group */
	.figs {
		display: flex;
		align-items: center;
		gap: var(--gap-grid);
		min-width: 0;
	}
	/* Too narrow to read the breakdown → drop it and keep payee + the net amount. */
	@container (max-width: 440px) {
		.figs {
			display: none;
		}
	}
	/* one figure column: title-case label over its value, right-aligned to line up with the amount */
	.fig {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
	}
	.flabel {
		color: var(--ink-2);
		font-size: var(--text-caption);
		text-transform: capitalize;
	}
	.fval {
		font-size: var(--text-caption);
		font-variant-numeric: tabular-nums;
	}
	.amt {
		text-align: right;
		font-variant-numeric: tabular-nums;
		font-weight: var(--fw-semibold);
		font-size: var(--text-row);
	}
	.pos {
		color: var(--good-text);
	}
</style>
