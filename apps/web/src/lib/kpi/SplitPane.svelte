<script module lang="ts">
	import type { Categorical } from '$lib/data/primitives';
	import type { ColorBy } from '$lib/charts/registry';

	export interface SplitRow {
		label: string;
		parts: Categorical;
		base?: number;
		colorBy?: ColorBy;
		fit?: boolean;
	}
</script>

<script lang="ts">
	// A stat card whose figures are split bars: an optional headline figure, then one bar per total, each
	// split into its parts. `open` makes its title a drill-in to the page owning its figures.
	import type { DashboardData } from '$lib/data/types';
	import type { Scalar } from '$lib/data/primitives';
	import type { Scope } from '$lib/data/scope';
	import type { Label } from '$lib/ui/label';
	import { build } from '$lib/data/catalog';
	import { readingsOf } from '$lib/data/primitives';
	import { fitReadings } from '$lib/ui/readings';
	import Reading from '$lib/ui/Reading.svelte';
	import { NO_VALUE } from '$lib/copy';
	import Pane from '$lib/layout/grid/Pane.svelte';
	import DeltaBadge from '$lib/ui/DeltaBadge.svelte';
	import SplitBar from '$lib/charts/SplitBar.svelte';

	interface Props {
		id: string;
		data: DashboardData;
		title: Label;
		caption?: Label;
		/** A catalog scalar shown large above the bars. */
		headline?: { figure: string; scope: Scope };
		rows: SplitRow[];
		open?: string;
	}
	let { id, data, title, caption, headline, rows, open }: Props = $props();

	const figure = $derived(
		headline ? (build(data, headline.figure, headline.scope) as Scalar) : null
	);

	/** How fully the headline reads (see `Reading`). */
	let levels = $state<Record<string, number>>({});
</script>

<Pane {id} {title} {caption} {open}>
	<div class="body" data-measure>
		{#if figure}
			<div class="figure" use:fitReadings={(l) => (levels = l)}>
				<span class="num serif">
					<Reading
						readings={figure.value === null ? [NO_VALUE] : readingsOf(figure.value, figure.unit)}
						level={levels.headline ?? 0}
						group="headline"
					/>
				</span>
				{#if figure.delta}<DeltaBadge delta={figure.delta} />{/if}
			</div>
		{/if}
		{#each rows as row (row.label)}
			<SplitBar {...row} />
		{/each}
	</div>
</Pane>

<style>
	.body {
		display: grid;
		gap: var(--space-7);
		align-content: start;
		flex: 1 1 auto;
		min-width: 0;
		min-height: 0;
	}
	/* The change on its own line under the figure, so the figure has the row to read as fully as it can. */
	.figure {
		display: grid;
		justify-items: start;
		gap: var(--space-1);
	}
	.num {
		font-size: var(--text-display);
		font-weight: var(--fw-semibold);
		font-variant-numeric: tabular-nums;
		letter-spacing: var(--ls-tighter);
		line-height: normal;
		white-space: nowrap;
		justify-self: stretch;
		min-width: 0;
	}
</style>
