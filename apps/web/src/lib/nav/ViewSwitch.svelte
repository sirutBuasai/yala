<script lang="ts">
	// The Month and Year switch, named by the grain of the bars (D19). A view is a path under the page, and
	// switching widens the board, since a pick belongs to the grain it was made on.
	import { page } from '$app/stores';
	import { pageOf } from '$lib/nav/pages';
	import { step } from '$lib/nav/step';
	import Segmented from '$lib/nav/Segmented.svelte';
	import { viewOf, type View } from '$lib/nav/views';

	let { ariaLabel }: { ariaLabel: string } = $props();

	const OPTIONS: { id: View; label: string }[] = [
		{ id: 'month', label: 'Month' },
		{ id: 'year', label: 'Year' }
	];

	const base = $derived(pageOf($page.url.pathname));
	const view = $derived(viewOf($page.params.view));
</script>

<Segmented
	options={OPTIONS}
	value={view}
	onchange={(v) =>
		step($page.url, { scope: null }, { pathname: v === 'month' ? base : `${base}/${v}` })}
	{ariaLabel}
/>
