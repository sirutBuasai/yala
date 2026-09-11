<script lang="ts">
	import { fitFontSize, UNMEASURED } from '$lib/charts/axis';
	import { money, moneyK, esc } from '$lib/utils/format';
	import { clamp, sumBy } from '$lib/utils/num';
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
	const sum = $derived(total ?? sumBy(rows, (r) => r.value));

	// Measured on both axes (as the bar/line charts are) so the labels and value text keep a constant
	// on-screen size instead of shrinking with the pane — a fixed viewBox made them unreadable in a
	// narrow card.
	let boxW = $state(0);
	let boxH = $state(0);
	const W = $derived(boxW || UNMEASURED.w);
	/** Rows share the pane's height so a tall pane has no empty band under the last bar, down to a
	    floor where a row stops being a readable bar with a label beside it. */
	const rowH = $derived(boxH ? Math.max(24, (boxH - 4) / Math.max(1, rows.length)) : 29);
	// Both gutters scale with the box between a readable floor and a ceiling that stops them eating
	// the bars — a constant gutter either clipped names in a narrow card or wasted space in a wide one.
	const m = $derived({
		t: 4,
		l: clamp(W * 0.26, 72, 168),
		r: clamp(W * 0.12, 44, 72)
	});
	const iw = $derived(Math.max(40, W - m.l - m.r));
	const H = $derived(m.t + rows.length * rowH);
	const max = $derived(Math.max(1, ...rows.map((r) => Math.abs(r.value))));

	// An unlabelled role="img" announces only "image".
	const label = $derived(`Ranked bars: ${rows.map((r) => r.label).join(', ')}`);
	// Shrink to fit the gutter rather than truncating: an SVG text node has no ellipsis, so a too-long
	// name would simply run under the bars.
	const labelFont = $derived(
		fitFontSize(
			m.l - 10,
			rows.map((r) => r.label)
		)
	);
</script>

<div class="figurebox" bind:clientWidth={boxW} bind:clientHeight={boxH}>
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
