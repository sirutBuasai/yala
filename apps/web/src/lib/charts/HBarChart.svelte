<script lang="ts">
	import { fitFontSize } from '$lib/charts/axis';
	import { money, moneyK, esc } from '$lib/utils/format';
	import { clamp } from '$lib/utils/num';
	import { showTip, hideTip } from '$lib/utils/tooltip';
	import Empty from '$lib/ui/Empty.svelte';

	interface Item {
		label: string;
		value: number;
		color: string;
	}
	interface Props {
		items: Item[];
		/** Total for tooltip percentages; defaults to the sum of values. */
		total?: number;
	}
	let { items, total }: Props = $props();

	const rows = $derived([...items].sort((a, b) => b.value - a.value));
	const sum = $derived(total ?? rows.reduce((a, r) => a + r.value, 0));

	// Measure the width (as the bar/line charts do) so the labels and value text keep a constant
	// on-screen size instead of shrinking with the pane — a fixed viewBox made these unreadable in
	// a third-width card.
	let boxW = $state(0);
	const W = $derived(boxW || 520);
	const rowH = 29;
	// Both gutters scale with the box between a readable floor and a ceiling that stops them eating
	// the bars: a third-width card used to clip its row names against a constant 112px gutter, and a
	// full-width one wasted the same 112px on short ones.
	const m = $derived({
		t: 4,
		l: clamp(W * 0.26, 72, 168),
		r: clamp(W * 0.12, 44, 72)
	});
	const iw = $derived(Math.max(40, W - m.l - m.r));
	const H = $derived(m.t + rows.length * rowH);
	const max = $derived(Math.max(1, ...rows.map((r) => Math.abs(r.value))));

	// A name for the chart, since an unlabelled role="img" announces only "image".
	const label = $derived(`Ranked bars: ${rows.map((r) => r.label).join(', ')}`);
	// Whatever gutter we end up with, shrink the labels to fit it rather than truncating: an SVG
	// text node has no ellipsis, so a too-long name would simply run under the bars.
	const labelFont = $derived(
		fitFontSize(
			m.l - 10,
			rows.map((r) => r.label)
		)
	);
</script>

<div class="hbox" bind:clientWidth={boxW}>
	{#if rows.length}
		<svg class="chart" viewBox="0 0 {W} {H}" role="img" aria-label={label}>
			{#each rows as d, i (d.label)}
				{@const yy = m.t + i * rowH}
				{@const bw = Math.max(2, (iw * Math.abs(d.value)) / max)}
				<text
					class="glabel"
					x={m.l - 10}
					y={yy + rowH / 2 + 4}
					text-anchor="end"
					style:font-size={`${labelFont}px`}>{d.label}</text
				>
				<rect x={m.l} y={yy + 5} width={iw} height={rowH - 13} rx="4" fill="var(--inset)" />
				<rect
					x={m.l}
					y={yy + 5}
					width={bw}
					height={rowH - 13}
					rx="4"
					fill={d.color}
					role="presentation"
					onmousemove={(e) =>
						showTip(
							`<b>${esc(d.label)}</b><br>${money(d.value)} · ${sum ? Math.round((d.value / sum) * 100) : 0}%`,
							e
						)}
					onmouseleave={hideTip}
				/>
				<text class="vlabel" x={m.l + bw + 8} y={yy + rowH / 2 + 4}>{moneyK(d.value)}</text>
			{/each}
		</svg>
	{:else}
		<Empty>No data.</Empty>
	{/if}
</div>

<style>
	/* Width-only measurement: height still comes from the row count, so the pane grows with the
	   data instead of the chart being stretched to fill it. */
	.hbox {
		width: 100%;
	}
</style>
