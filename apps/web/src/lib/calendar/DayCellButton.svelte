<script lang="ts">
	// One day in the month grid. A gridcell rather than a plain button: the grid around it owns
	// arrow-key movement, and this cell only reports whether it is the selected one.
	import type { DayCell } from '$lib/calendar/days';
	import { money, moneyCompact, MONTHS } from '$lib/utils/format';
	import { categoryVar } from '$lib/utils/theme';

	interface Props {
		cell: DayCell;
		month: number;
		selected: boolean;
		onpick: (day: number) => void;
	}
	let { cell, month, selected, onpick }: Props = $props();

	/** The cell's spoken name; everything visible inside it is aria-hidden, since a colour dot and an
	    abbreviated figure mean nothing read aloud. */
	const label = $derived.by(() => {
		const parts = [`${MONTHS[month - 1]} ${cell.day}`];
		if (cell.txns.length)
			parts.push(`${cell.txns.length} transactions, ${money(cell.spent)} spent`);
		if (cell.income) parts.push(`${money(cell.income)} income`);
		if (cell.pending) parts.push('has pending entries');
		if (!cell.txns.length && !cell.income) parts.push('no activity');
		return parts.join('. ');
	});
</script>

<button
	type="button"
	role="gridcell"
	data-day={cell.day}
	class="cell"
	class:sel={selected}
	class:pending={cell.pending}
	aria-selected={selected}
	aria-label={label}
	tabindex={selected ? 0 : -1}
	title={cell.pending ? 'Click to complete pending txn' : undefined}
	onclick={() => onpick(cell.day)}
>
	<span class="dn" aria-hidden="true">{cell.day}</span>
	{#if cell.cats.length}
		<span class="cdots" aria-hidden="true">
			{#each cell.cats as cat (cat)}<i style:background={categoryVar(cat)}></i>{/each}
			{#if cell.more}<span class="more">+</span>{/if}
		</span>
	{/if}
	{#if cell.income || cell.txns.length}
		<span class="camounts" aria-hidden="true">
			{#if cell.income}<span class="inc">+{moneyCompact(cell.income)}</span>{/if}
			{#if cell.txns.length}<span>{moneyCompact(cell.spent)}</span>{/if}
		</span>
	{/if}
</button>

<style>
	/* --sel and --pend are set by the grid, which swaps them per theme. */
	.cell {
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		padding: var(--pad-cell);
		cursor: pointer;
		position: relative;
		text-align: left;
		font: inherit;
		color: inherit;
		transition:
			border-color 0.1s,
			transform 0.06s;
	}
	.cell:hover {
		border-color: var(--sel);
	}
	.cell.pending {
		border-color: var(--pend);
		background: color-mix(in srgb, var(--pend) 13%, var(--surface-2));
	}
	.cell.sel {
		border-color: var(--sel);
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--sel) 35%, transparent);
	}
	.dn {
		position: absolute;
		top: 8px;
		left: 8px;
		font-size: var(--text-secondary);
		color: var(--ink-2);
		font-weight: var(--fw-semibold);
	}
	.cdots {
		position: absolute;
		top: 8px;
		right: 8px;
		display: flex;
		align-items: center;
		gap: var(--space-1);
		flex-wrap: wrap;
		max-width: 46px;
		justify-content: flex-end;
	}
	.cdots i {
		width: 6px;
		height: 6px;
		border-radius: var(--radius-pill);
		display: block;
	}
	.cdots .more {
		font-size: var(--text-micro);
		font-weight: var(--fw-bold);
		line-height: 1;
		color: var(--ink-3);
	}
	.camounts {
		position: absolute;
		bottom: 8px;
		right: 8px;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 1px;
		line-height: var(--lh-tight);
	}
	.camounts span {
		font-size: var(--text-micro);
		font-weight: var(--fw-semibold);
		font-variant-numeric: tabular-nums;
	}
	.inc {
		color: var(--good-text);
	}
	/* Too narrow for a figure: seven columns leave a cell smaller than one, and both of these are out of
	   flow, so they overrun rather than reporting a shortfall. The dots alone carry "something happened
	   here" and the figures are a tap away in the day panel. Scoped to the width at which the grid drops
	   its week gutter (see CalendarGrid), so the cell changes shape once. */
	@container (max-width: 30rem) {
		.camounts {
			display: none;
		}
		.cdots {
			inset: auto 4px 5px 4px;
			max-width: none;
			justify-content: center;
			overflow: hidden;
		}
	}
</style>
