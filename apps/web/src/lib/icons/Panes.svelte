<script lang="ts">
	// An arrangement of panes. Marks the "Arrange" toggle.
	import Icon from './Icon.svelte';

	interface Props {
		size?: number;
	}
	let { size = 14 }: Props = $props();

	// x, y, w, h in the icon's units, inset so the stroke has room.
	const PANES = [
		[2, 2, 6, 12],
		[9.5, 2, 4.5, 5],
		[9.5, 9, 4.5, 5]
	];
</script>

<Icon {size} weight={1.4}>
	{#each PANES as [x, y, width, height] (x + '-' + y)}
		<rect {x} {y} {width} {height} rx="1.5" />
	{/each}
</Icon>
