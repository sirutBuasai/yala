<script lang="ts">
	// A directional arrow (shaft + head), e.g. the transaction sort-order toggle.
	// One source of truth for the glyph so every arrow matches.
	interface Props {
		dir: 'up' | 'down';
		size?: number;
	}
	let { dir, size = 14 }: Props = $props();

	const d = $derived(dir === 'up' ? 'M8 13V3M4.5 6.5 8 3l3.5 3.5' : 'M8 3v10M4.5 9.5 8 13l3.5-3.5');
</script>

<svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
	<path
		{d}
		fill="none"
		stroke="currentColor"
		stroke-width="1.6"
		stroke-linecap="round"
		stroke-linejoin="round"
	/>
</svg>
