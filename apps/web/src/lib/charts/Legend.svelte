<script module lang="ts">
	export interface Key {
		name: string;
		color: string;
		/** Drawn as a dashed rule rather than a solid block, so the key matches the mark. */
		dashed?: boolean;
	}
</script>

<script lang="ts">
	import Swatch from '$lib/charts/marks/Swatch.svelte';
	// Shared by every chart that names its series, so swatch size, order and the dashed variant can't drift.
	interface Props {
		keys: Key[];
		/** Key underneath the plot instead of above it. */
		below?: boolean;
		/** Reverse the keys, for a chart whose first series is drawn at the bottom. */
		reverse?: boolean;
	}
	let { keys, below = false, reverse = false }: Props = $props();

	const shown = $derived(reverse ? keys.slice().reverse() : keys);
</script>

<div class="legend" class:below>
	{#each shown as k (k.name)}
		<span class="k">
			<Swatch color={k.color} dashed={k.dashed} />{k.name}
		</span>
	{/each}
</div>
