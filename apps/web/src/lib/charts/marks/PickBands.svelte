<script lang="ts">
	// The periods a continuous axis picks: one band per run of points sharing a period, drawn under the
	// marks. The chart's own hit layer takes the pointer, since it sits over the lines and reports each
	// point; these bands shade the run it is over and are what the keyboard reaches.
	import type { PickGroup } from '$lib/charts/axis';
	import { onPress } from '$lib/charts/aria';
	import { monthLabel } from '$lib/utils/format';

	interface Props {
		groups: PickGroup[];
		/** The run under the pointer, by key. */
		hovered: string | null;
		picked?: string | null;
		onpick: (key: string) => void;
		height: number;
	}
	let { groups, hovered, picked, onpick, height }: Props = $props();

	const name = (key: string) => (/^\d{4}-\d{2}$/.test(key) ? monthLabel(key) : key);
</script>

{#each groups as g (g.key)}
	<rect
		class="band"
		class:lit={g.key === hovered && g.key !== picked}
		x={g.from}
		y={0}
		width={g.to - g.from}
		{height}
		rx="6"
		role="button"
		tabindex="0"
		aria-label={name(g.key)}
		aria-pressed={g.key === picked}
		onkeydown={(e) => onPress(e, () => onpick(g.key))}
	/>
{/each}

<style>
	.band {
		fill: transparent;
		outline: none;
	}
	.lit,
	.band:focus-visible {
		fill: var(--inset);
	}
	.band:focus-visible {
		stroke: var(--ring-color);
		stroke-width: var(--ring-width);
	}
</style>
