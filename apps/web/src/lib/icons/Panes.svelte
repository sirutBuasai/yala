<script lang="ts">
	// An arrangement of panes. Marks the "Arrange" toggle.
	interface Props {
		size?: number;
	}
	let { size = 14 }: Props = $props();

	// x, y, w, h in the viewBox's units, inset so the stroke has room.
	const PANES = [
		[2, 2, 6, 12],
		[9.5, 2, 4.5, 5],
		[9.5, 9, 4.5, 5]
	];
</script>

<svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
	{#each PANES as [x, y, width, height] (x + '-' + y)}
		<rect {x} {y} {width} {height} rx="1.5" fill="none" stroke="currentColor" stroke-width="1.4" />
	{/each}
</svg>
