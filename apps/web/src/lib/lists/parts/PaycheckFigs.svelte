<script module lang="ts">
	// Figures a paycheck row can break out into its own aligned column. 'saved' sums the
	// contributions; 'deductions' sums every deduction entry.
	export type PaycheckField =
		'gross' | 'tax' | 'benefits' | 'deductions' | 'saved' | 'takehome' | 'net';
</script>

<script lang="ts">
	// A paycheck row's breakout figures, sharing one grid cell so they collapse as a unit. The list around
	// it must be a size container: the figures drop out when it is too narrow for them.
	import type { PaycheckOut } from '$lib/data/types';
	import { money } from '$lib/utils/format';
	import { sumValues } from '$lib/utils/num';

	let { p, fields }: { p: PaycheckOut; fields: PaycheckField[] } = $props();

	const LABELS: Record<PaycheckField, string> = {
		gross: 'gross',
		tax: 'tax',
		benefits: 'benefits',
		deductions: 'deductions',
		saved: 'saved',
		takehome: 'take-home',
		net: 'income'
	};

	function value(f: PaycheckField): number {
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
</script>

<span class="figs">
	{#each fields as f (f)}
		<span class="fig">
			<span class="flabel">{LABELS[f]}</span>
			<span class="fval">{money(value(f))}</span>
		</span>
	{/each}
</span>

<style>
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
