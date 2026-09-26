<script lang="ts">
	// The Month and Year switch, named by the grain of the bars (D19). A view is a path under the page. It
	// opens with the focus month and no picks, at the scroll it was left at (D30).
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { withFocus } from '$lib/nav/focus';
	import { restoreScroll, scrollAt } from '$lib/nav/left';
	import { pageOf } from '$lib/nav/pages';
	import Segmented from '$lib/nav/Segmented.svelte';
	import { viewOf, type View } from '$lib/nav/views';

	let { ariaLabel }: { ariaLabel: string } = $props();

	const OPTIONS: { id: View; label: string }[] = [
		{ id: 'month', label: 'Month' },
		{ id: 'year', label: 'Year' }
	];

	const base = $derived(pageOf($page.url.pathname));
	const view = $derived(viewOf($page.params.view));

	async function show(v: View) {
		const path = v === 'month' ? base : `${base}/${v}`;
		await goto(withFocus(path, $page.url), { keepFocus: true, noScroll: true });
		restoreScroll(scrollAt(path));
	}
</script>

<Segmented options={OPTIONS} value={view} onchange={show} {ariaLabel} />
