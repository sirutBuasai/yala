<script lang="ts">
	// A pane whose contents are a catalog figure. The data→visual coupling stays in the registry and the
	// placement stays in the board's pane table; this only joins the two, so a view adds a chart by
	// adding one entry to that table.
	import type { DashboardData } from '$lib/data/types';
	import type { FigureSpec } from './figure';
	import { build } from '$lib/data/catalog';
	import Figure from '$lib/charts/Figure.svelte';
	import Pane from './Pane.svelte';

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
	const caption = $derived(
		spec.caption ?? (primitive.kind === 'scalar' ? primitive.note : undefined)
	);

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

<Pane {id} {title} {caption}>
	<Figure {primitive} {...options} />
</Pane>
