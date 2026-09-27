<script lang="ts">
	// Joins a catalog figure to a pane, so a view adds a chart with one pane-table entry.
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
		/** See `Figure`: makes the chart's rows or cells choosable, and marks the chosen one. */
		onpick?: (key: string, sub: string | null) => void;
		picked?: string | null;
		/** The page the title opens: the owner of a figure shown here as a headline. */
		open?: string;
	}
	let { id, data, spec, actions, onpick, picked, open }: Props = $props();

	const primitive = $derived(build(data, spec.figure, spec.scope));

	/** Everything the registry's `adapt` might want: whatever is left once the pane takes its own. */
	const options = $derived.by(() => {
		const { figure, scope, title, caption, ...rest } = spec;
		return rest;
	});
</script>

<Pane {id} title={spec.title} caption={spec.caption} {actions} {open}>
	<Figure {primitive} {...options} {onpick} {picked} />
</Pane>
