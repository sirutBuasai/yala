<script lang="ts">
	// Each row's level this period as a bar, with the range it usually falls in and its average drawn over
	// it, then its total and its distance from that average. Every row shares one scale, so bar lengths
	// compare across rows; the columns carry the exact figures a short bar cannot.
	import { formatDelta, formatUnitExact, type Unit } from '$lib/data/primitives';
	import { esc } from '$lib/utils/format';
	import { showTip, hideTip } from '$lib/utils/tooltip';

	interface Row {
		label: string;
		value: number;
		base: number;
		lo: number;
		hi: number;
		color: string;
	}
	interface Props {
		rows: Row[];
		unit: Unit;
	}
	let { rows, unit }: Props = $props();

	/** One scale for every row, from zero (or the lowest value, when a refund took one below it). */
	const at = $derived.by(() => {
		const min = Math.min(0, ...rows.flatMap((r) => [r.lo, r.value]));
		const max = Math.max(1, ...rows.flatMap((r) => [r.hi, r.value]));
		const span = max - min;
		return (v: number) => `${((v - min) / span) * 100}%`;
	});

	const fmt = (v: number) => formatUnitExact(v, unit);
	const tip = (r: Row) =>
		`<b>${esc(r.label)}</b><br>${fmt(r.value)} this month` +
		`<br>usual ${fmt(r.base)} (${fmt(r.lo)}–${fmt(r.hi)})`;
</script>

<div class="bars">
	<div class="row head" aria-hidden="true">
		<span></span><span></span><span class="num">Total</span><span class="num">vs avg</span>
	</div>
	{#each rows as r (r.label)}
		{@const delta = r.value - r.base}
		<div class="row">
			<span class="name">{r.label}</span>
			<div
				class="lane"
				role="presentation"
				onmousemove={(e) => showTip(tip(r), e)}
				onmouseleave={hideTip}
			>
				<span
					class="fill"
					style:left={at(Math.min(0, r.value))}
					style:right={`calc(100% - ${at(Math.max(0, r.value))})`}
					style:--fill={r.color}
				></span>
				<span class="range" style:left={at(r.lo)} style:right={`calc(100% - ${at(r.hi)})`}></span>
				<span class="base" style:left={at(r.base)}></span>
				<span
					class="now"
					class:out={r.value > r.hi || r.value < r.lo}
					style:left={at(r.value)}
					style:--fill={r.color}
				></span>
			</div>
			<span class="num total">{fmt(r.value)}</span>
			<span class="num delta" class:over={delta > 0} class:under={delta < 0}>
				{formatDelta(delta, unit)}
			</span>
		</div>
	{/each}
	<div class="key" aria-hidden="true">
		<span><i class="k-now"></i>this month</span>
		<span><i class="k-base"></i>average</span>
		<span><i class="k-range"></i>usual range</span>
	</div>
</div>

<style>
	/* One grid for every row, each row a subgrid of it, so the columns size to their widest figure and
	   still line up down the chart; the lane takes what is left. Rows spread through the pane's height
	   rather than stacking at the top. */
	.bars {
		--lane-h: 14px;
		--now-size: 10px;
		--base-size: 8px;
		--track-h: 4px;

		display: grid;
		flex: 1 1 auto;
		grid-template-columns: minmax(2.5rem, max-content) minmax(2rem, 1fr) max-content max-content;
		align-content: space-evenly;
		gap: var(--gap-row) var(--gap-field);
	}
	.row {
		display: grid;
		grid-column: 1 / -1;
		grid-template-columns: subgrid;
		align-items: center;
		font-size: var(--text-caption);
	}
	.head {
		font-size: var(--text-column);
		color: var(--ink-3);
		text-transform: uppercase;
		letter-spacing: var(--ls-wide);
	}
	.name {
		color: var(--ink-2);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.lane {
		position: relative;
		height: var(--lane-h);
	}
	.fill {
		position: absolute;
		top: 0;
		bottom: 0;
		border-radius: var(--radius-sm);
		background: color-mix(in srgb, var(--fill) calc(var(--mark-area) * 100%), transparent);
	}
	/* Every layer is centred on the lane, so each offset is half the difference in heights. */
	.range {
		position: absolute;
		top: calc((var(--lane-h) - var(--track-h)) / 2);
		height: var(--track-h);
		border-radius: var(--radius-pill);
		background: color-mix(in srgb, var(--ink-3) 45%, transparent);
	}
	/* Both markers are centred on their value, so the offset is half the dot. */
	.base,
	.now {
		position: absolute;
		border-radius: var(--radius-pill);
	}
	.base {
		top: calc((var(--lane-h) - var(--base-size)) / 2);
		width: var(--base-size);
		height: var(--base-size);
		margin-left: calc(var(--base-size) / -2);
		background: var(--surface);
		box-shadow: inset 0 0 0 1.5px var(--ink-2);
	}
	.now {
		top: calc((var(--lane-h) - var(--now-size)) / 2);
		width: var(--now-size);
		height: var(--now-size);
		margin-left: calc(var(--now-size) / -2);
		background: var(--fill);
	}
	/* Outside its own range: the one claim the markers make per row. */
	.now.out {
		box-shadow:
			0 0 0 1.5px var(--surface),
			0 0 0 3px var(--ink-3);
	}
	.num {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
	.total {
		color: var(--ink);
		font-weight: var(--fw-semibold);
	}
	.delta {
		color: var(--ink-2);
	}
	.delta.over {
		color: var(--crit-text);
	}
	.delta.under {
		color: var(--good-text);
	}
	.key {
		grid-column: 1 / -1;
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-8);
		font-size: var(--text-caption);
		color: var(--ink-3);
	}
	.key span {
		display: inline-flex;
		align-items: center;
		gap: var(--gap-inline);
	}
	.key i {
		display: inline-block;
		border-radius: var(--radius-pill);
	}
	.k-now {
		width: 10px;
		height: 10px;
		background: var(--ink-3);
	}
	.k-base {
		width: 8px;
		height: 8px;
		box-shadow: inset 0 0 0 1.5px var(--ink-2);
	}
	.k-range {
		width: 18px;
		height: 4px;
		background: color-mix(in srgb, var(--ink-3) 45%, transparent);
	}
</style>
