<script lang="ts">
	// The Month and Year switch, named by the grain of the bars. A view is a path under the page, and
	// opens as it was left: its own picks and its own scroll.
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { leftAt, restoreScroll, scrollAt } from '$lib/nav/left';
	import { pageOf } from '$lib/nav/pages';
	import Segmented from '$lib/nav/Segmented.svelte';
	import { viewOf, type View } from '$lib/nav/views';

	let { ariaLabel }: { ariaLabel: string } = $props();

	const OPTIONS: { id: View; label: string }[] = [
		{ id: 'month', label: 'Monthly' },
		{ id: 'year', label: 'Yearly' }
	];

	const base = $derived(pageOf($page.url.pathname));
	const view = $derived(viewOf($page.params.view));

	async function show(v: View) {
		const path = v === 'month' ? base : `${base}/${v}`;
		await goto(leftAt(path), { keepFocus: true, noScroll: true });
		restoreScroll(scrollAt(path));
	}
</script>

<Segmented options={OPTIONS} value={view} onchange={show} {ariaLabel} />
