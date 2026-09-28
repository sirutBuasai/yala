<script lang="ts">
	// Parts of a whole ranked largest first, each a bar against the largest, with its figure beside it. Rows
	// are HTML on one grid, like RangeBars, so the names and figures line up and a row picks the same way.
	import { esc } from '$lib/utils/format';
	import { chartFormat } from '$lib/charts/format';
	import { type Unit } from '$lib/data/primitives';
	import { sumBy } from '$lib/utils/num';
	import { showTip, hideTip } from '$lib/utils/tooltip';
	import Empty from '$lib/ui/Empty.svelte';
	import Bands from '$lib/charts/marks/Bands.svelte';
	import PickRow from '$lib/charts/marks/PickRow.svelte';

	interface Item {
		label: string;
		value: number;
		color: string;
	}
	interface Props {
		items: Item[];
		unit: Unit;
		/** Total for tooltip percentages; defaults to the sum of values. */
		total?: number;
		/** Makes each row a button choosing its label. */
		onpick?: (label: string) => void;
	}
	let { items, unit, total, onpick }: Props = $props();

	const f = $derived(chartFormat(unit));

	const rows = $derived([...items].sort((a, b) => b.value - a.value));
	const sum = $derived(total ?? sumBy(rows, (r) => r.value));
	const max = $derived(Math.max(1, ...rows.map((r) => Math.abs(r.value))));
	const tip = (d: Item) =>
		`<b>${esc(d.label)}</b><br>${f.exact(d.value)} · ${sum ? Math.round((d.value / sum) * 100) : 0}%`;
</script>

{#if rows.length}
	<div class="bars">
		{#each rows as d (d.label)}
			<PickRow label={d.label} {onpick}>
				<span class="name">{d.label}</span>
				<span
					class="lane"
					role="presentation"
					onmousemove={(e) => showTip(tip(d), e)}
					onmouseleave={hideTip}
				>
					<Bands
						radius={4}
						bands={[
							{ from: 0, to: 100, fill: 'color-mix(in srgb, var(--ink-3) 14%, transparent)' },
							{ from: 0, to: (Math.abs(d.value) / max) * 100, fill: d.color }
						]}
					/>
				</span>
				<span class="num">{f.compact(d.value)}</span>
			</PickRow>
		{/each}
	</div>
{:else}
	<Empty>No data.</Empty>
{/if}

<style>
	/* One grid for every row, each row a subgrid of it, so names and figures line up; rows spread through
	   the pane's height rather than stacking at the top. */
	.bars {
		display: grid;
		flex: 1 1 auto;
		grid-template-columns: minmax(2.5rem, max-content) minmax(2rem, 1fr) max-content;
		align-content: space-evenly;
		gap: var(--gap-row) var(--gap-field);
	}
	.name {
		color: var(--ink-2);
		text-align: right;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.lane {
		display: block;
		height: 16px;
	}
	.num {
		text-align: right;
		font-variant-numeric: tabular-nums;
		color: var(--ink-2);
	}
</style>
