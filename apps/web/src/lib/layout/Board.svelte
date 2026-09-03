<script module lang="ts">
	import type { ColorBy } from '$lib/charts/registry';
	import type { Scope } from '$lib/data/scope';

	/** One figure on the board. Exported so a view can annotate its cell list and have its
	    literals type-checked where they're written, not where they're passed. */
	export interface Cell {
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
		/** What a categorical's keys name (categories, accounts, roles) — drives their colours. */
		colorBy?: ColorBy;
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
</script>

<script lang="ts">
	// A responsive grid of cells, each a Pane wrapping a Figure built from a catalog id. One
	// cell list lays out a tab's stats and charts together (span = columns on the grid).
	import type { DashboardData } from '$lib/data/types';
	import type { Primitive } from '$lib/data/primitives';
	import { build } from '$lib/data/catalog';
	import Pane from '$lib/ui/Pane.svelte';
	import Figure from '$lib/charts/Figure.svelte';

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
		<!-- The span rides in a custom property rather than on `grid-column` directly, so the
		     narrower layouts below can re-place the cell; an inline `grid-column` would outrank
		     every rule that tried. -->
		<div class="cell" class:wide={(c.span ?? 1) * 2 > cols} style:--span={c.span ?? 1}>
			<Pane title={titleOf(c, p)} cap={capOf(c, p)}>
				<Figure
					primitive={p}
					chart={c.chart}
					area={c.area}
					color={c.color}
					colorBy={c.colorBy}
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
		grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
		gap: var(--gap-grid);
		align-items: stretch;
		margin-bottom: var(--space-9);
	}
	.cell {
		grid-column: span var(--span);
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.cell :global(.card) {
		flex: 1 1 auto;
	}
	/* Two intermediate steps rather than one cliff. Going straight from a six-column grid to a
	   single column turned a row of four KPIs into four full-width slabs; at two columns they stay a
	   readable 2×2. A cell that took over half the wide grid is that row's principal figure, so it
	   still gets the full width here. */
	@media (max-width: 68rem) {
		.board {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.cell {
			grid-column: span 1;
		}
		.cell.wide {
			grid-column: 1 / -1;
		}
	}
	@media (max-width: 34rem) {
		.board {
			grid-template-columns: minmax(0, 1fr);
		}
		.cell,
		.cell.wide {
			grid-column: 1 / -1;
		}
	}
</style>
