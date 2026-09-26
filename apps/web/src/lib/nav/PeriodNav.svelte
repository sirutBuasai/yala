<script lang="ts">
	// A board's period controls beside its view switch: Month steps its year, Year picks how far back it
	// reaches (D25).
	import type { View } from '$lib/nav/views';
	import { SPANS, type periodPicks } from '$lib/nav/picks';
	import Segmented from '$lib/nav/Segmented.svelte';
	import YearNav from '$lib/nav/YearNav.svelte';

	let { view, picks }: { view: View; picks: ReturnType<typeof periodPicks> } = $props();
</script>

{#if view === 'month'}
	<YearNav value={picks.year} years={picks.years} onchange={picks.moveToYear} />
{:else}
	<Segmented options={SPANS} value={picks.span} onchange={picks.pickSpan} ariaLabel="Years shown" />
	<span class="cap">{picks.since == null ? `Lifetime · ${picks.spanText}` : picks.spanText}</span>
{/if}
