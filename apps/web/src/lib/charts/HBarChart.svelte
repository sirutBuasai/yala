<script lang="ts">
	import { money, moneyK, esc } from '$lib/utils/format';
	import { showTip, hideTip } from '$lib/utils/tooltip';
	import Empty from '$lib/layout/Empty.svelte';

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
	const m = { t: 4, r: 58, l: 112 };
	const iw = $derived(Math.max(40, W - m.l - m.r));
	const H = $derived(m.t + rows.length * rowH);
	const max = $derived(Math.max(1, ...rows.map((r) => Math.abs(r.value))));
</script>

<div class="hbox" bind:clientWidth={boxW}>
	{#if rows.length}
		<svg class="chart" viewBox="0 0 {W} {H}" role="img">
			{#each rows as d, i (d.label)}
				{@const yy = m.t + i * rowH}
				{@const bw = Math.max(2, (iw * Math.abs(d.value)) / max)}
				<text class="glabel" x={m.l - 10} y={yy + rowH / 2 + 4} text-anchor="end">{d.label}</text>
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
