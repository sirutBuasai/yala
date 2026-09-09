<script lang="ts">
	// An arrangement of panes — a tall one beside two stacked ones, which is the arrangement the
	// grid exists to make possible. Marks the "Arrange" toggle.
	interface Props {
		size?: number;
	}
	let { size = 14 }: Props = $props();

	// x, y, w, h in a 16-unit box, inset by 2 so the stroke has room.
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
