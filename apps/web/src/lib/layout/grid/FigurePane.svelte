<script lang="ts">
	// A pane whose contents are a catalog figure. The data→visual coupling stays in the registry and the
	// placement stays in the board's pane table; this only joins the two, so a view adds a chart by
	// adding one entry to that table.
	import type { Snippet } from 'svelte';
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
		/** Header controls, for the one figure a view lets you act on rather than only read. */
		actions?: Snippet;
	}
	let { id, data, spec, actions }: Props = $props();

	const primitive = $derived(build(data, spec.figure, spec.scope));

	/** Everything the registry's `adapt` might want: whatever is left once the pane takes its own. */
	const options = $derived.by(() => {
		const { figure, scope, title, caption, ...rest } = spec;
		return rest;
	});
</script>

<Pane {id} title={spec.title} caption={spec.caption} {actions}>
	<Figure {primitive} {...options} />
</Pane>
