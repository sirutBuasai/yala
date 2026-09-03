<script lang="ts">
	// A responsive grid of cells, each a Pane wrapping a Figure built from a catalog id. One
	// cell list lays out a tab's stats and charts together (span = columns on the grid).
	import type { DashboardData } from '$lib/data/types';
	import type { Primitive } from '$lib/data/primitives';
	import { build } from '$lib/data/catalog';
	import type { Scope } from '$lib/data/scope';
	import Pane from '$lib/layout/Pane.svelte';
	import Figure from '$lib/charts/Figure.svelte';

	interface Cell {
		/** Catalog id to build. */
		id: string;
		scope: Scope;
		/** Chart id; defaults to the first chart for the primitive's kind (stat for scalars). */
		chart?: string;
		/** Columns spanned (of `cols`). */
		span?: number;
		/** Title override; a scalar otherwise titles itself with its label. */
		title?: string;
		/** Subtitle override; a scalar otherwise uses its note. */
		cap?: string;
		area?: boolean;
		color?: string;
		total?: number;
		/** Log-scale a line chart's value axis. */
		log?: boolean;
		/** Label lines at their right edge instead of drawing a legend. */
		endLabels?: boolean;
		/** Series names to draw dotted — a secondary reading against a primary one. */
		dashed?: string[];
		/** Heatmap scaling: per row (default) or one scale for the whole grid. */
		normalize?: 'row' | 'global';
	}

	interface Props {
		data: DashboardData;
		cells: Cell[];
		/** Columns on wide screens (cells collapse to full width under 900px). */
		cols?: number;
	}
	let { data, cells, cols = 6 }: Props = $props();

	const titleOf = (c: Cell, p: Primitive) => c.title ?? (p.kind === 'scalar' ? p.label : '');
	const capOf = (c: Cell, p: Primitive) => c.cap ?? (p.kind === 'scalar' ? p.note : undefined);
</script>

<div class="board" style:--cols={cols}>
	{#each cells as c, i (c.id + i)}
		{@const p = build(data, c.id, c.scope)}
		<div class="cell" style:grid-column={`span ${c.span ?? 1}`}>
			<Pane title={titleOf(c, p)} cap={capOf(c, p)}>
				<Figure
					primitive={p}
					chart={c.chart}
					area={c.area}
					color={c.color}
					total={c.total}
					log={c.log}
					endLabels={c.endLabels}
					dashed={c.dashed}
					normalize={c.normalize}
				/>
			</Pane>
		</div>
	{/each}
</div>

<style>
	.board {
		display: grid;
		grid-template-columns: repeat(var(--cols), 1fr);
		gap: var(--gap-grid);
		align-items: stretch;
		margin-bottom: var(--space-9);
	}
	.cell {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.cell :global(.card) {
		flex: 1 1 auto;
	}
	@media (max-width: 900px) {
		.board {
			grid-template-columns: 1fr;
		}
		.cell {
			grid-column: 1 / -1 !important;
		}
	}
</style>
