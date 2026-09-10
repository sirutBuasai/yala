<script lang="ts">
	// One glyph per height mode, built from the same two marks — rules for the edges that bound the
	// pane, and an arrow for where the content pushes — so they read as a set.
	import type { HeightMode } from '$lib/layout/grid/types';

	interface Props {
		mode: HeightMode;
		size?: number;
	}
	let { mode, size = 14 }: Props = $props();

	const TOP = 'M3 2.5H13';
	const BOTTOM = 'M3 13.5H13';

	const PATHS: Record<HeightMode, string[]> = {
		fixed: [
			TOP,
			BOTTOM,
			'M8 4.6V7.3M5.9 5.2 8 7.3 10.1 5.2',
			'M8 11.4V8.7M5.9 10.8 8 8.7 10.1 10.8'
		],
		cap: [TOP, BOTTOM, 'M8 4.8V11.2M5.8 8.8 8 11.2 10.2 8.8'],
		fit: [TOP, 'M8 4.8V12.8M5.8 10.4 8 12.8 10.2 10.4']
	};
</script>

<svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
	{#each PATHS[mode] as d (d)}
		<path
			{d}
			fill="none"
			stroke="currentColor"
			stroke-width="1.5"
			stroke-linecap="round"
			stroke-linejoin="round"
		/>
	{/each}
</svg>
