<script lang="ts">
	import { pie, arc } from 'd3-shape';
	import { money, esc } from '$lib/format';
	import { showTip, hideTip } from '$lib/tooltip';

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
		<svg class="chart" viewBox="0 0 {R * 2} {R * 2}" role="img" style:max-width="{R * 2}px">
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
							font-size="11"
							font-weight="600"
							fill="#1a1522">{pctOf(a.data.value)}%</text
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
	<p class="empty">No data.</p>
{/if}

<style>
	.donut {
		display: flex;
		gap: 22px;
		align-items: center;
		flex-wrap: wrap;
	}
	.donut svg {
		flex: 0 0 auto;
	}
	.legend-list {
		list-style: none;
		margin: 0;
		padding: 0;
		flex: 1;
		min-width: 160px;
	}
	.legend-list li {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 4px 0;
		font-size: 12.5px;
	}
	.legend-list .sw {
		width: 11px;
		height: 11px;
		border-radius: 3px;
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
	.empty {
		color: var(--ink-3);
	}
</style>
