<script lang="ts">
	import { money, esc } from '$lib/utils/format';
	import { theme } from '$lib/utils/theme';
	import { showTip, hideTip } from '$lib/utils/tooltip';

	interface Props {
		/** Row-axis labels (months). */
		rows: string[];
		/** Column-axis labels (categories). */
		cols: string[];
		/** Cell values indexed as values[rowIndex][colIndex]. */
		values: number[][];
	}
	let { rows, cols, values }: Props = $props();

	const max = $derived(Math.max(1, ...values.flat()));
	const dark = $derived($theme !== 'light');

	// viewBox scales to the pane width, so the grid fills the pane.
	const W = 1000;
	const ML = 46; // left margin for month labels
	const MT = 24; // top margin for category labels
	const MR = 6;
	const CELL_H = 30;
	const iw = $derived(W - ML - MR);
	const cw = $derived(iw / Math.max(1, cols.length));
	const H = $derived(MT + rows.length * CELL_H + 4);

	// Shrink the column-header font (never below 7px) so even the longest category
	// name fits inside its cell in full — no truncation.
	const longestCol = $derived(Math.max(1, ...cols.map((c) => c.length)));
	const colFont = $derived(Math.max(7, Math.min(10, (cw - 6) / (0.58 * longestCol))));

	/** Ramp index 0..5 by magnitude; anything <= 0 sits below the ramp (inset). */
	function step(v: number): number {
		return v <= 0 ? -1 : Math.min(5, Math.floor((v / max) * 6));
	}
	function bg(v: number): string {
		const s = step(v);
		return s < 0 ? 'var(--inset)' : `var(--s${s + 1})`;
	}
	// Light text on the deep end of the ramp.
	function fg(v: number): string {
		const s = step(v);
		const lightText = s < 0 ? dark : dark ? s <= 3 : s >= 3;
		return lightText ? '#f4efe4' : '#2b2621';
	}
	function label(v: number): string {
		return v >= 1000 ? (v / 1000).toFixed(1) + 'k' : String(Math.round(v));
	}
</script>

<svg class="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Category by month heatmap">
	{#each cols as c, j (c)}
		<text
			class="colh"
			x={ML + cw * j + cw / 2}
			y={MT - 8}
			text-anchor="middle"
			style:font-size={`${colFont}px`}>{c}</text
		>
	{/each}
	{#each rows as r, i (r)}
		<text class="rowh" x={ML - 8} y={MT + CELL_H * i + CELL_H / 2 + 4} text-anchor="end">{r}</text>
		{#each cols as c, j (c)}
			{@const v = values[i]?.[j] ?? 0}
			<rect
				x={ML + cw * j + 2}
				y={MT + CELL_H * i + 2}
				width={cw - 4}
				height={CELL_H - 4}
				rx="5"
				fill={bg(v)}
				role="presentation"
				onmousemove={(e) => showTip(`<b>${esc(c)} · ${esc(r)}</b><br>${money(v)}`, e)}
				onmouseleave={hideTip}
			/>
			<text
				class="cellv"
				x={ML + cw * j + cw / 2}
				y={MT + CELL_H * i + CELL_H / 2 + 4}
				text-anchor="middle"
				fill={fg(v)}>{label(v)}</text
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
	}
	.rowh {
		fill: var(--ink-3);
		font-size: var(--text-axis);
	}
	.cellv {
		font-size: var(--text-micro);
		font-variant-numeric: tabular-nums;
		pointer-events: none;
	}
</style>
