<script lang="ts">
	// Heatmap over a Matrix, on the shared --s1..--s6 sequential ramp.
	//
	// Rows are scaled to their own max by default, because a real ledger's categories span orders of
	// magnitude within one year and a single grid-wide scale leaves the median cell near-blank. The
	// trade-off is that intensity is no longer comparable BETWEEN rows; row order carries that.
	//
	// One hue rather than per-category hues: the category palette isn't luminance-matched, so at
	// equal value a warm hue reads far brighter than a cool one and colour would fight the data.
	import { fitFontSize } from '$lib/charts/axis';
	import { money, esc } from '$lib/utils/format';
	import { theme } from '$lib/utils/theme';
	import { showTip, hideTip } from '$lib/utils/tooltip';

	interface Props {
		/** Row-axis labels (categories). */
		rows: string[];
		/** Column-axis labels (months). */
		cols: string[];
		/** Cell values indexed as values[rowIndex][colIndex]. */
		values: number[][];
		/** 'row' scales each row to its own max (default); 'global' uses one scale for the grid. */
		normalize?: 'row' | 'global';
	}
	let { rows, cols, values, normalize = 'row' }: Props = $props();

	const dark = $derived($theme !== 'light');

	// A fixed viewBox that scales to the pane width, so the grid always fills the pane.
	const W = 1000;
	const ML = 96; // gutter for the row labels
	const MT = 24; // band for the column labels
	const MR = 6;
	const CELL_H = 30;
	const iw = $derived(W - ML - MR);
	const cw = $derived(iw / Math.max(1, cols.length));
	const H = $derived(MT + rows.length * CELL_H + 4);

	// Shrink rather than truncate: an SVG text node has no ellipsis.
	const rowFont = $derived(fitFontSize(ML - 10, rows, 7, 11));

	const globalMax = $derived(Math.max(1, ...values.flat()));
	const rowMax = $derived(rows.map((_, i) => Math.max(1, ...(values[i] ?? []).map(Math.abs))));
	const scaleOf = (i: number) => (normalize === 'row' ? rowMax[i]! : globalMax);

	/** Ramp index 0..5 by magnitude; anything <= 0 sits below the ramp, as -1. */
	function step(v: number, i: number): number {
		return v <= 0 ? -1 : Math.min(5, Math.floor((v / scaleOf(i)) * 6));
	}
	function bg(v: number, i: number): string {
		const s = step(v, i);
		return s < 0 ? 'var(--inset)' : `var(--s${s + 1})`;
	}
	// Light text on the deep end of the ramp, which flips with the theme.
	function fg(v: number, i: number): string {
		const s = step(v, i);
		const lightText = s < 0 ? dark : dark ? s <= 3 : s >= 3;
		return lightText ? '#f4efe4' : '#2b2621';
	}
	function label(v: number): string {
		if (v === 0) return '';
		return Math.abs(v) >= 1000 ? (v / 1000).toFixed(1) + 'k' : String(Math.round(v));
	}
</script>

<svg class="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Category by month heatmap">
	{#each cols as c, j (c)}
		<text class="colh" x={ML + cw * j + cw / 2} y={MT - 8} text-anchor="middle">{c}</text>
	{/each}
	{#each rows as r, i (r)}
		<text
			class="rowh"
			x={ML - 8}
			y={MT + CELL_H * i + CELL_H / 2 + 4}
			text-anchor="end"
			style:font-size={`${rowFont}px`}>{r}</text
		>
		{#each cols as c, j (c)}
			{@const v = values[i]?.[j] ?? 0}
			<rect
				x={ML + cw * j + 2}
				y={MT + CELL_H * i + 2}
				width={cw - 4}
				height={CELL_H - 4}
				rx="5"
				fill={bg(v, i)}
				role="presentation"
				onmousemove={(e) => showTip(`<b>${esc(r)} · ${esc(c)}</b><br>${money(v)}`, e)}
				onmouseleave={hideTip}
			/>
			<text
				class="cellv"
				x={ML + cw * j + cw / 2}
				y={MT + CELL_H * i + CELL_H / 2 + 4}
				text-anchor="middle"
				fill={fg(v, i)}>{label(v)}</text
			>
		{/each}
	{/each}
</svg>

<style>
	svg {
		display: block;
		width: 100%;
		overflow: visible;
	}
	.colh {
		fill: var(--ink-3);
		font-size: var(--text-axis);
	}
	.rowh {
		fill: var(--ink-3);
	}
	.cellv {
		font-size: var(--text-micro);
		font-variant-numeric: tabular-nums;
		pointer-events: none;
	}
</style>
