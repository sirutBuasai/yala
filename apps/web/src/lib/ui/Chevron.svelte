<script lang="ts">
	// A directional chevron used by the period steppers (month/year nav, date picker).
	// One source of truth for the glyph so every stepper arrow matches.
	interface Props {
		dir: 'left' | 'right';
		size?: number;
	}
	let { dir, size = 14 }: Props = $props();

	const d = $derived(dir === 'left' ? 'M10 3.5 5.5 8 10 12.5' : 'M6 3.5 10.5 8 6 12.5');
</script>

<svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
	<path
		{d}
		fill="none"
		stroke="currentColor"
		stroke-width="1.7"
		stroke-linecap="round"
		stroke-linejoin="round"
	/>
</svg>
