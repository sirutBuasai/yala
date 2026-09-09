<script lang="ts">
	// Two columns of dots — the universal "pick this up and move it" mark. Used by the pane grid's
	// drag handle. Dots rather than a stroked glyph so it reads as texture at 14px and doesn't
	// compete with the pane title beside it.
	interface Props {
		size?: number;
	}
	let { size = 14 }: Props = $props();

	const COLUMNS = [5.5, 10.5];
	const ROWS = [4, 8, 12];
</script>

<svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
	{#each COLUMNS as cx (cx)}
		{#each ROWS as cy (cy)}
			<circle {cx} {cy} r="1.35" fill="currentColor" />
		{/each}
	{/each}
</svg>
