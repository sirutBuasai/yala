<script lang="ts">
	import { pie, arc } from 'd3-shape';
	import { money, esc } from '$lib/utils/format';
	import { showTip, hideTip } from '$lib/utils/tooltip';
	import Empty from '$lib/layout/Empty.svelte';

	interface Slice {
		name: string;
		value: number;
		color: string;
	}
	interface Props {
		slices: Slice[];
	}
	let { slices }: Props = $props();

	const R = 120;
	const total = $derived(slices.reduce((a, s) => a + s.value, 0));

	const arcs = $derived(
		pie<Slice>()
			.value((d) => d.value)
			.sort(null)(slices)
	);
	const arcGen = arc<(typeof arcs)[number]>()
		.innerRadius(R * 0.62)
		.outerRadius(R);

	const pctOf = (v: number) => (total ? Math.round((v / total) * 100) : 0);
</script>

{#if slices.length}
	<div class="donut">
		<svg class="chart" viewBox="0 0 {R * 2} {R * 2}" role="img">
			<g transform="translate({R},{R})">
				{#each arcs as a (a.data.name)}
					<path
						d={arcGen(a) ?? ''}
						fill={a.data.color}
						stroke="var(--surface)"
						stroke-width="2"
						role="presentation"
						onmousemove={(e) =>
							showTip(
								`<b>${esc(a.data.name)}</b><br>${money(a.data.value)} · ${pctOf(a.data.value)}%`,
								e
							)}
						onmouseleave={hideTip}
					/>
					{#if a.endAngle - a.startAngle > 0.32}
						{@const c = arcGen.centroid(a)}
						<text
							x={c[0]}
							y={c[1] + 4}
							text-anchor="middle"
							style="font-size: var(--text-caption); font-weight: var(--fw-semibold)"
							fill="var(--on-accent)">{pctOf(a.data.value)}%</text
						>
					{/if}
				{/each}
			</g>
		</svg>
		<ul class="legend-list">
			{#each slices as s (s.name)}
				<li>
					<span class="sw" style:background={s.color}></span>
					<span class="nm">{s.name}</span>
					<span class="val">{money(s.value)} · {pctOf(s.value)}%</span>
				</li>
			{/each}
		</ul>
	</div>
{:else}
	<Empty>No data.</Empty>
{/if}

<style>
	/* Side-by-side by default. When an ancestor is a size-container (the Monthly donut pane, which
	   stretches to the paycheck+bill column) and it gets tall, the legend drops below the ring and
	   the ring grows to fill — a container query, so it reacts to the pane, not the viewport. */
	.donut {
		display: flex;
		gap: var(--space-11);
		align-items: center;
		flex-wrap: wrap;
		height: 100%;
	}
	.donut svg {
		flex: 0 0 auto;
		max-width: 240px;
	}
	.legend-list {
		list-style: none;
		margin: 0;
		padding: 0;
		flex: 1;
		min-width: 160px;
	}
	@container (min-height: 300px) {
		.donut {
			flex-direction: column;
			flex-wrap: nowrap;
			justify-content: center;
			gap: var(--space-9);
		}
		.donut svg {
			max-width: min(58cqh, 260px);
		}
		.legend-list {
			flex: none;
			width: 100%;
			columns: 2;
			column-gap: var(--space-11);
		}
	}
	@container (min-height: 300px) and (min-width: 460px) {
		.legend-list {
			columns: 3;
		}
	}
	.legend-list li {
		display: flex;
		align-items: center;
		gap: var(--gap-row);
		padding: var(--space-2) 0;
		font-size: var(--text-caption);
		/* keep a row intact when the legend flows into multiple columns (stacked layout) */
		break-inside: avoid;
	}
	.legend-list .sw {
		width: 11px;
		height: 11px;
		border-radius: var(--radius-xs);
		flex: 0 0 auto;
	}
	.legend-list .nm {
		flex: 1;
		color: var(--ink-2);
	}
	.legend-list .val {
		color: var(--ink-3);
		font-variant-numeric: tabular-nums;
	}
</style>
