<script module lang="ts">
	// Figures a paycheck row can break out into its own aligned column. 'saved' sums the
	// contributions; 'deductions' sums every deduction entry.
	type PaycheckField = 'gross' | 'tax' | 'benefits' | 'deductions' | 'saved' | 'takehome' | 'net';
</script>

<script lang="ts">
	import type { PaycheckOut } from '$lib/data/types';
	import { money } from '$lib/utils/format';
	import { sumValues } from '$lib/utils/num';
	import RowList from '$lib/lists/RowList.svelte';
	import Amount from '$lib/ui/Amount.svelte';

	interface Props {
		paychecks: PaycheckOut[];
		/** Supply to make rows clickable — they open the paycheck editor. */
		onedit?: (locator: string) => void;
		/** Hide the per-row date (e.g. in the calendar day panel, which already names the day). */
		showDate?: boolean;
		/** Which figures to break out into columns, in order. Trailing amount is always net. */
		fields?: PaycheckField[];
	}
	let { paychecks, onedit, showDate = true, fields = ['gross', 'takehome'] }: Props = $props();

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

	// The breakout figures share ONE grid cell so they collapse as a unit. RowList drops the cell at
	// its own threshold; this list thins them earlier, since they need more room than one column.
</script>

<div class="pc">
	<RowList
		items={paychecks}
		{onedit}
		columnTracks="auto"
		density="comfortable"
		dotColor={() => 'var(--role-income)'}
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
			<Amount value={p.net} sign="credit" />
		{/snippet}
	</RowList>
</div>

<style>
	.pc {
		/* size-container so the figure cell can hide when its pane is too narrow */
		container-type: inline-size;
		min-width: 0;
	}
	.title {
		font-size: var(--text-row);
		font-weight: var(--fw-medium);
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.figs {
		display: flex;
		align-items: center;
		gap: var(--gap-grid);
		min-width: 0;
	}
	/* Too narrow for the breakdown: drop it, keep the payee and the net. */
	@container (max-width: 440px) {
		.figs {
			display: none;
		}
	}
	/* one figure column: label over value, right-aligned to line up with the amount */
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
</style>
