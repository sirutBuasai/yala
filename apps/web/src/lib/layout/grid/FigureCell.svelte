<script module lang="ts">
	import type { ColorBy } from '$lib/charts/registry';
	import type { Scope } from '$lib/data/scope';

	/**
	 * One figure on the board: which catalog id to build, at which scope, and how to draw it.
	 * Exported so a view can annotate its table of figures and have the literals type-checked where
	 * they're written rather than where they're passed.
	 */
	export interface FigureSpec {
		/** Catalog id to build. */
		figure: string;
		scope: Scope;
		/** Chart id; defaults to the first chart for the primitive's kind (stat for scalars). */
		chart?: string;
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
	// A pane whose contents are a catalog figure. The data→visual coupling stays in the registry (see
	// `Figure`) and the placement stays in the board's layout table; this only joins the two, so a
	// view adds a chart by adding one line to each table rather than by importing a chart.
	import type { DashboardData } from '$lib/data/types';
	import { build } from '$lib/data/catalog';
	import Figure from '$lib/charts/Figure.svelte';
	import Cell from './Cell.svelte';

	interface Props {
		/** Pane id in the board's layout. */
		id: string;
		data: DashboardData;
		spec: FigureSpec;
	}
	let { id, data, spec }: Props = $props();

	const primitive = $derived(build(data, spec.figure, spec.scope));
	// A scalar carries its own label and note; anything else is titled by the view.
	const title = $derived(spec.title ?? (primitive.kind === 'scalar' ? primitive.label : ''));
	const cap = $derived(spec.cap ?? (primitive.kind === 'scalar' ? primitive.note : undefined));

	/** Everything the registry's `adapt` might want, and nothing the pane owns. */
	const options = $derived({
		chart: spec.chart,
		area: spec.area,
		color: spec.color,
		colorBy: spec.colorBy,
		total: spec.total,
		log: spec.log,
		endLabels: spec.endLabels,
		dashed: spec.dashed,
		normalize: spec.normalize
	});
</script>

<Cell {id} {title} {cap}>
	<Figure {primitive} {...options} />
</Cell>
