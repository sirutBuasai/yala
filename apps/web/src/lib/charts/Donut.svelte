<script lang="ts">
	import { pie, arc } from 'd3-shape';
	import { money, esc } from '$lib/utils/format';
	import { showTip, hideTip } from '$lib/utils/tooltip';
	import Empty from '$lib/ui/Empty.svelte';

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
	<!-- `.sizebox` (app.css) is the size container the layout below queries, so the keys move beside or
	     under the ring on the PANE's shape rather than the viewport's. -->
	<div class="sizebox">
		<div class="donut">
			<!-- aria-hidden deliberately: the legend below is the same data as text, which is more use to
		     a screen reader than a labelled image. -->
			<svg class="chart" viewBox="0 0 {R * 2} {R * 2}" aria-hidden="true">
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
						<span class="nm" title={s.name}>{s.name}</span>
						<span class="val">{money(s.value)} · {pctOf(s.value)}%</span>
					</li>
				{/each}
			</ul>
		</div>
	</div>
{:else}
	<Empty>No data.</Empty>
{/if}

<style>
	/* Side-by-side by default, both flexible: the ring grows into spare width up to a legible ceiling
	   and the legend takes what's left, wrapping onto its own row rather than crushing the ring. */
	.donut {
		display: flex;
		gap: var(--space-11);
		align-items: center;
		flex-wrap: wrap;
		height: 100%;
	}
	.donut svg {
		flex: 1 1 9rem;
		min-width: 8.5rem;
		max-width: 15rem;
	}
	/* A column WIDTH, not a column count: the browser fits as many columns as the legend's actual box
	   allows, so the keys reflow continuously instead of stepping at hardcoded breakpoints. */
	.legend-list {
		list-style: none;
		margin: 0;
		padding: 0;
		flex: 1 1 13rem;
		min-width: 0;
		columns: 13rem;
		column-gap: var(--space-11);
	}
	/* Once the pane is tall, stack: the keys drop below the ring and the ring grows into the height.
	   This reflow is why the donut has no single minimum size — stacking needs more height, and how
	   much more depends on how many keys there are, so it can only be measured. */
	@container (min-height: 300px) {
		.donut {
			flex-direction: column;
			flex-wrap: nowrap;
			justify-content: center;
			gap: var(--space-9);
		}
		.donut svg {
			flex: 0 1 auto;
			width: min(58cqh, 16rem);
			max-width: 100%;
		}
		.legend-list {
			flex: 0 0 auto;
			width: 100%;
		}
	}
	.legend-list li {
		display: flex;
		align-items: center;
		gap: var(--gap-row);
		padding: var(--space-2) 0;
		font-size: var(--text-caption);
		/* keep a row intact when the legend flows into multiple columns */
		break-inside: avoid;
	}
	.legend-list .sw {
		width: 11px;
		height: 11px;
		border-radius: var(--radius-xs);
		flex: 0 0 auto;
	}
	/* The name gives way, the figure never does: a long name truncates (full text on hover) rather
	   than pushing the amount out of the column. */
	.legend-list .nm {
		flex: 1 1 auto;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--ink-2);
	}
	.legend-list .val {
		flex: 0 0 auto;
		color: var(--ink-3);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
</style>
